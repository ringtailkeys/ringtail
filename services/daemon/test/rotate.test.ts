// PROOF (PRD Phase 2): credential ROTATION end-to-end against the mock provider, with SAFE
// rollback. The full path: an old key is minted (its id captured) → `rotateKey` parks a
// human-approve → on approve the daemon runs mint-new → switch-the-sink → revoke-old LOCALLY,
// value-free. Plus the two rollbacks:
//   - revoke fails  → PARTIAL: the new key is live, the old one is NOT revoked ("revoke manually").
//   - mint fails    → ABORTED: the old key is preserved (never revoked), the project keeps working.
// THE GUARANTEE holds throughout: no secret value (old or minted) crosses any REST/MCP/SSE surface.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { listRotations, readStore } from "@ringtail/store";
import { createDaemon } from "../src/index";
import { MOCK_MINTED_KEY, type MockOAuth, startMockOAuth } from "./mock-oauth";

// The single pasted root the mock accepts as a bearer — reaches the host, never comes back.
const ROOT_KEY = "ROOT-ROTATE-SENTINEL-7777";

let dir: string;
let mock: MockOAuth;
let server: ReturnType<typeof Bun.serve>;
let token: string;
let origin: string;
let H: Record<string, string>;
let client: Client;
/** Every daemon → agent/dashboard payload (MCP tool results + SSE + approve/root bodies). */
const transcript: string[] = [];
const sseChunks: string[] = [];
let stopSse: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-rotate-"));
  mock = startMockOAuth([ROOT_KEY]); // the pasted root passes the bearer check
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.RINGTAIL_ALLOW_MOCK = "1"; // opt the loopback mock host into the allowlist (test-only)

  const daemon = createDaemon({ repoName: "ringtail", envLocalPath: join(dir, ".env.local") });
  token = daemon.token;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: daemon.app.fetch });
  origin = `http://127.0.0.1:${server.port}`;
  H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // open the SSE stream (the nonce + the parked cards live here — the DASHBOARD channel)
  const dec = new TextDecoder();
  const sse = await fetch(`${origin}/events?token=${token}`);
  const reader = sse.body!.getReader();
  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sseChunks.push(dec.decode(value));
    }
  })();
  stopSse = () => reader.cancel();

  // paste the ONE root through the intake path (user → daemon vault; value-free response)
  const rootBody = await (
    await fetch(`${origin}/api/root`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ providerAccount: "mock", value: ROOT_KEY }),
    })
  ).text();
  transcript.push(rootBody);

  client = new Client({ name: "rotate-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  await stopSse();
  await server.stop(true);
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

/** Call a tool, record the raw result, return the parsed value-free payload. */
async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await client.callTool({ name, arguments: args });
  transcript.push(JSON.stringify(res));
  const text = (res.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

/** Scan the SSE stream for the LATEST parked nonce filed under `varName`. */
async function latestNonce(varName: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 60)); // let the parked snapshot flush to SSE
  for (const chunk of [...sseChunks].reverse()) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const snap = JSON.parse(line.slice(6)) as {
          pendingMints?: Array<{ nonce: string; varName?: string }>;
        };
        const hit = snap.pendingMints?.find((p) => p.varName === varName);
        if (hit) return hit.nonce;
      } catch {
        /* partial chunk */
      }
    }
  }
  throw new Error(`no parked nonce for ${varName} on the SSE stream`);
}

/** POST a nonce approval; record + return the parsed result. */
async function approve(nonce: string): Promise<Record<string, unknown>> {
  const body = await (
    await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ nonce }),
    })
  ).text();
  transcript.push(body);
  return JSON.parse(body) as Record<string, unknown>;
}

const mintTpl = (varName: string, fail = false) => ({
  providerAccount: "mock",
  method: "POST",
  url: `${mock.mintUrl}${fail ? "?fail=1" : ""}`,
  headers: { Authorization: "Bearer {{ROOT}}" },
  body: { name: "ringtail-key" },
  extract: { varName, path: "api_key", idPath: "id" },
});

const revokeTpl = (fail = false) => ({
  providerAccount: "mock",
  method: "DELETE" as const,
  url: `${mock.keysUrl}/{{OLD_KEY_ID}}${fail ? "?fail=1" : ""}`,
  headers: { Authorization: "Bearer {{ROOT}}" },
});

/** Mint the initial (old) key for `varName` and return its captured provider key id. */
async function mintInitial(varName: string): Promise<string> {
  const proposed = await call("mintKey", { action: mintTpl(varName), env: "local" });
  expect(proposed.status).toBe("needs-confirm");
  const res = await approve(await latestNonce(varName));
  expect(res.status).toBe("minted");
  const keyId = readStore().credentials[varName]?.keyId;
  expect(keyId).toBeDefined();
  return keyId!;
}

test("happy rotate → done: mint new → sink switched → old revoked, value-free", async () => {
  const varName = "ROT_OK";
  const oldId = await mintInitial(varName);

  const proposed = await call("rotateKey", {
    rotate: { varName, mint: mintTpl(varName), revoke: revokeTpl() },
    env: "local",
  });
  expect(proposed.status).toBe("needs-confirm"); // a rotation is consequential → parked

  const result = await approve(await latestNonce(varName));
  expect(result.status).toBe("minted"); // clean rotation

  const newId = readStore().credentials[varName]?.keyId;
  expect(newId).toBeDefined();
  expect(newId).not.toBe(oldId); // the sink now holds the NEW key
  expect(mock.revokedIds).toContain(oldId); // the OLD key was revoked at the provider
  expect(mock.revokedIds).not.toContain(newId); // the new key is NOT revoked

  // the rotation record is value-free (ids + outcome, no secret)
  const rec = listRotations().at(-1)!;
  expect(rec.outcome).toBe("done");
  expect(rec.oldKeyId).toBe(oldId);
  expect(rec.newKeyId).toBe(newId);
  expect(JSON.stringify(rec)).not.toContain(MOCK_MINTED_KEY);
});

test("rollback — revoke fails → partial: new key live, old NOT revoked, 'revoke manually'", async () => {
  const varName = "ROT_REVOKEFAIL";
  const oldId = await mintInitial(varName);

  await call("rotateKey", {
    rotate: { varName, mint: mintTpl(varName), revoke: revokeTpl(true) }, // revoke forced to 500
    env: "local",
  });
  const result = await approve(await latestNonce(varName));

  expect(result.status).toBe("partial"); // switched but not revoked
  expect(String(result.reason)).toContain("revoke it manually");
  const newId = readStore().credentials[varName]?.keyId;
  expect(newId).not.toBe(oldId); // the new key IS live in the sink (not rolled back)
  expect(mock.revokedIds).not.toContain(oldId); // the old key was NOT revoked
  expect(listRotations().at(-1)!.outcome).toBe("partial");
});

test("rollback — mint fails → aborted: old key preserved, never revoked", async () => {
  const varName = "ROT_MINTFAIL";
  const oldId = await mintInitial(varName);
  const revokedBefore = mock.revokedIds.length;

  await call("rotateKey", {
    rotate: { varName, mint: mintTpl(varName, true), revoke: revokeTpl() }, // mint forced to 500
    env: "local",
  });
  const result = await approve(await latestNonce(varName));

  expect(result.status).toBe("failed");
  expect(String(result.reason)).toContain("old key kept");
  // the old key is untouched: same id still in the sink, nothing revoked.
  expect(readStore().credentials[varName]?.keyId).toBe(oldId);
  expect(mock.revokedIds.length).toBe(revokedBefore);
  expect(mock.revokedIds).not.toContain(oldId);
  expect(listRotations().at(-1)!.outcome).toBe("aborted");
});

test("THE GUARANTEE: no secret value ever crossed a REST/MCP/SSE surface", async () => {
  const blob = [...transcript, ...sseChunks].join("\n");
  expect(blob).not.toContain(ROOT_KEY); // the root reached the mock host, never came back
  expect(blob).not.toContain(MOCK_MINTED_KEY); // no minted value ever left the daemon
  // positive controls: the value-free evidence DID cross.
  expect(blob).toContain("minted");
  expect(blob).toContain("partial");
  expect(blob).toContain("ROT_OK");
});
