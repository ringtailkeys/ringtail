// PROOF (the North Star): a NEW PROJECT PROVISIONS ITSELF under ONE approval. Against the mock
// provider, end-to-end:
//   paste a root (user → daemon vault) → the agent authors a BATCH (two {{ROOT}} mints + one
//   set-nameservers WIRE action) + the project's full var list → provisionProject parks the WHOLE
//   batch under ONE nonce and classifies the rest (needs-root / guided-paste / skip) value-free →
//   the human approves the ONE nonce → both keys minted to the sink + the domain wired, each var a
//   value-free result → assert NOTHING (REST · MCP · SSE) ever carried the root or the minted value.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createDaemon } from "../src/index";
import { MOCK_MINTED_KEY, type MockOAuth, startMockOAuth } from "./mock-oauth";

// The pasted ROOT master key — reaches the allowlisted mock host but must NEVER come back.
const ROOT_BATCH = "ROOT-BATCH-SENTINEL-VALUE-7777";
const NS = ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"];

let dir: string;
let mock: MockOAuth;
let server: ReturnType<typeof Bun.serve>;
let token: string;
let origin: string;
let H: Record<string, string>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-batch-"));
  mock = startMockOAuth([ROOT_BATCH]); // the pasted root passes the mock's bearer check
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.RINGTAIL_ALLOW_MOCK = "1"; // opt the loopback mock host into the allowlist (test-only)

  const daemon = createDaemon({ repoName: "acme", envLocalPath: join(dir, ".env.local") });
  token = daemon.token;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: daemon.app.fetch });
  origin = `http://127.0.0.1:${server.port}`;
  H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
});

afterAll(async () => {
  await server.stop(true);
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

/** Open an SSE reader; returns the accumulated chunks + a stop() that drains + cancels. */
function openSse(): { chunks: string[]; stop: () => Promise<void> } {
  const chunks: string[] = [];
  const dec = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  const started = fetch(`${origin}/events?token=${token}`).then((sse) => {
    reader = sse.body!.getReader();
    return (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(dec.decode(value));
      }
    })();
  });
  return {
    chunks,
    stop: async () => {
      await new Promise((r) => setTimeout(r, 50));
      await reader!.cancel();
      await started;
    },
  };
}

/** Scan the SSE chunks for the parked BATCH → its nonce. */
function findBatchNonce(chunks: string[]): string | null {
  for (const chunk of [...chunks].reverse()) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const snap = JSON.parse(line.slice(6)) as {
          pendingMints?: Array<{ nonce: string; batch?: boolean }>;
        };
        const hit = snap.pendingMints?.find((p) => p.batch);
        if (hit) return hit.nonce;
      } catch {
        /* partial chunk */
      }
    }
  }
  return null;
}

/** A {{ROOT}} mint template against the mock's /mint (consequential — parked in the batch). */
const mintTemplate = (varName: string) => ({
  providerAccount: "mock",
  method: "POST",
  url: mock.mintUrl,
  headers: { Authorization: "Bearer {{ROOT}}" },
  body: { name: `acme-${varName}` },
  extract: { varName, path: "api_key" },
});

/** A set-nameservers WIRE action (no extract) against the mock's PUT /domains/:domain. Shaped
 * like GoDaddy's buildSetNameserversAction but pointed at the mock host so the e2e stays offline. */
const setNsTemplate = () => ({
  providerAccount: "mock",
  method: "PUT",
  url: `${mock.domainsUrl}/example.com`, // mock.domainsUrl = …/domains ; PUT …/domains/example.com
  headers: { Authorization: "Bearer {{ROOT}}" },
  body: { nameServers: NS },
  danger: "destructive" as const,
});

test("one approval provisions the whole project: 2 keys minted + 1 domain wired, rest classified", async () => {
  const sse = openSse();
  await new Promise((r) => setTimeout(r, 20));

  // 0. paste the root (user → daemon vault) — value-free intake response.
  const rootBody = await (
    await fetch(`${origin}/api/root`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ providerAccount: "mock", value: ROOT_BATCH }),
    })
  ).text();
  expect(rootBody).not.toContain(ROOT_BATCH);

  // 1. the agent authors the BATCH + the project's full var list.
  const toolResults: string[] = [];
  const client = new Client({ name: "batch-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    toolResults.push(JSON.stringify(res));
    return (res.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  };

  const vars = [
    "BATCH_KEY_A", //     minted in the batch
    "BATCH_KEY_B", //     minted in the batch
    "NEON_API_KEY", //    neon recipe, NO neon root connected → needs-root
    "DATABASE_URL", //    neon provisioned resource            → skip
    "SOME_UNKNOWN_VAR", //no recipe                            → guided-paste
  ];
  const proposedText = await call("provisionProject", {
    mints: [mintTemplate("BATCH_KEY_A"), mintTemplate("BATCH_KEY_B"), setNsTemplate()],
    vars,
    env: "local",
  });
  const proposed = JSON.parse(proposedText) as {
    status: string;
    count: number;
    parked: Array<{ varName?: string }>;
    plan: Array<{ varName: string; action: string }>;
  };

  // ONE parked approval covering all THREE batch actions.
  expect(proposed.status).toBe("needs-confirm");
  expect(proposed.count).toBe(3);
  expect(
    proposed.parked
      .map((p) => p.varName)
      .filter((v): v is string => Boolean(v))
      .toSorted((a, b) => a.localeCompare(b)),
  ).toEqual(["BATCH_KEY_A", "BATCH_KEY_B"]);
  // the rest are classified value-free (never faked).
  const planBy = Object.fromEntries(proposed.plan.map((i) => [i.varName, i.action]));
  expect(planBy["NEON_API_KEY"]).toBe("needs-root");
  expect(planBy["DATABASE_URL"]).toBe("skip");
  expect(planBy["SOME_UNKNOWN_VAR"]).toBe("guided-paste");
  // needs-confirm carried NO value (root or minted).
  expect(proposedText).not.toContain(ROOT_BATCH);

  // 2. the HUMAN approves the ONE batch nonce (read off the dashboard-only SSE).
  await new Promise((r) => setTimeout(r, 60));
  const nonce = findBatchNonce(sse.chunks);
  expect(nonce).not.toBeNull();
  const approveBody = await (
    await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ nonce }),
    })
  ).text();
  const approved = JSON.parse(approveBody) as {
    results: Array<{ varName?: string; providerAccount: string; status: string }>;
  };

  // both keys minted, the domain wired — all under the one approval.
  expect(approved.results.length).toBe(3);
  const byVar = Object.fromEntries(
    approved.results.filter((r) => r.varName).map((r) => [r.varName, r.status]),
  );
  expect(byVar["BATCH_KEY_A"]).toBe("minted");
  expect(byVar["BATCH_KEY_B"]).toBe("minted");
  // the wire action (no varName) succeeded as `ok`.
  expect(approved.results.some((r) => !r.varName && r.status === "ok")).toBe(true);

  // the root was substituted into {{ROOT}} and reached the allowlisted host…
  expect(mock.authSeen).toContain(`Bearer ${ROOT_BATCH}`);
  // …and the set-nameservers PUT landed the CF nameservers on the chosen domain.
  const ns = mock.nsSeen.at(-1)!;
  expect(ns.domain).toBe("example.com");
  expect(ns.nameServers).toEqual(NS);

  await client.close();
  await sse.stop();

  // THE GUARANTEE across the WHOLE batch: nothing the daemon sent back — REST, MCP, or SSE —
  // carries the root or the minted value.
  const daemonToClient = [...toolResults, ...sse.chunks, rootBody, approveBody].join("\n");
  expect(daemonToClient).not.toContain(ROOT_BATCH);
  expect(daemonToClient).not.toContain(MOCK_MINTED_KEY);
  // positive controls: the value-free evidence DID cross (var names, classifications, status).
  expect(daemonToClient).toContain("BATCH_KEY_A");
  expect(daemonToClient).toContain("needs-root");
  expect(daemonToClient).toContain("minted");
});
