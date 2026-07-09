// PROOF (PRD §4.4): the MULTI-ROOT registry, end-to-end against the mock provider.
// A provider can hold MANY named roots ("prod" + "staging"); the mint flow surfaces WHICH to
// spend through the SAME value-free choice guided-mint built. The full path:
//   two named roots pasted via POST /api/root (user → daemon vault, value-free response) →
//   a guided mint parks a choice whose `choices.roots` lists BOTH roots value-free (labels/
//   ids, NO values) → the human selects one root + a resource/permission → discovery + the
//   SCOPED mint run against the SELECTED root → minted, value-free. Plus the backward-compat
//   case: a SINGLE-root provider mints with NO root-choice (discovery runs at propose, the
//   approve carries no rootId), exactly as before.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MintChoices } from "@ringtail/core";
import { createDaemon } from "../src/index";
import { MOCK_DOMAINS, MOCK_MINTED_KEY, type MockOAuth, startMockOAuth } from "./mock-oauth";

// Two DISTINCT pasted-root sentinels — the master keys the mock accepts as bearers, and the
// values the leak assertions hunt for (they must reach the host but never come back).
const ROOT_PROD = "ROOT-MOCK-PROD-SENTINEL-1111";
const ROOT_STAGING = "ROOT-MOCK-STAGING-SENTINEL-2222";

let dir: string;
let mock: MockOAuth;
let server: ReturnType<typeof Bun.serve>;
let token: string;
let origin: string;
let H: Record<string, string>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-multiroot-"));
  mock = startMockOAuth([ROOT_PROD, ROOT_STAGING]); // the two pasted roots pass the bearer check
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.RINGTAIL_ALLOW_MOCK = "1"; // opt the loopback mock host into the allowlist (test-only)
  process.env.RINGTAIL_DISCOVERY_MOCK_URL = mock.domainsUrl; // the mock's discovery GET

  const daemon = createDaemon({ repoName: "ringtail", envLocalPath: join(dir, ".env.local") });
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

/** POST a named root through the intake path; return the value-free response body text. */
async function postRoot(provider: string, label: string, value: string): Promise<string> {
  const res = await fetch(`${origin}/api/root`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ provider, label, value }),
  });
  return res.text();
}

/** A guided scoped-mint TEMPLATE — no hardcoded resource/permission (the human steers). */
const mintTemplate = (varName: string) => ({
  providerAccount: "mock",
  method: "POST",
  url: mock.mintUrl,
  headers: { Authorization: "Bearer {{ROOT}}" },
  body: { name: "ringtail-key", permission: "{{PERMISSION}}", domain_id: "{{RESOURCE}}" },
  extract: { varName, path: "api_key" },
  discover: true,
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

/** Scan the SSE chunks for the parked mint by var name → its nonce + choices. */
function findPending(
  chunks: string[],
  varName: string,
): { nonce: string; choices: MintChoices } | null {
  for (const chunk of [...chunks].reverse()) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const snap = JSON.parse(line.slice(6)) as {
          pendingMints?: Array<{ nonce: string; varName?: string; choices?: MintChoices }>;
        };
        const hit = snap.pendingMints?.find((p) => p.varName === varName);
        if (hit?.choices) return { nonce: hit.nonce, choices: hit.choices };
      } catch {
        /* partial chunk */
      }
    }
  }
  return null;
}

test("backward-compat: a SINGLE-root provider mints with NO root-choice (discovery at propose)", async () => {
  const sse = openSse();
  await new Promise((r) => setTimeout(r, 20));

  // one named root → resolveRoot is unambiguous.
  const rootBody = await postRoot("mock", "prod", ROOT_PROD);
  expect(rootBody).not.toContain(ROOT_PROD); // value-free intake response
  const roots = (JSON.parse(rootBody) as { roots: Array<{ label?: string }> }).roots;
  expect(roots.length).toBe(1);
  expect(roots[0]?.label).toBe("prod");

  const client = new Client({ name: "multiroot-single", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const proposed = await client.callTool({
    name: "mintKey",
    arguments: { action: mintTemplate("MR_SINGLE_KEY"), env: "local" },
  });
  const proposedText = (proposed.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  expect(JSON.parse(proposedText).status).toBe("needs-confirm");

  await new Promise((r) => setTimeout(r, 60));
  const pending = findPending(sse.chunks, "MR_SINGLE_KEY");
  expect(pending).not.toBeNull();
  // SINGLE root → NO root choice (backward-compat), and discovery ALREADY ran at propose.
  expect(pending!.choices.roots).toBeUndefined();
  expect(pending!.choices.resources.length).toBeGreaterThanOrEqual(2);

  // approve with NO rootId — the pre-multi-root shape still mints.
  const approveBody = await (
    await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        nonce: pending!.nonce,
        selection: { resource: MOCK_DOMAINS[0].id, permission: "sending_access" },
      }),
    })
  ).text();
  expect(JSON.parse(approveBody).status).toBe("minted");
  // the ONE root was substituted into {{ROOT}} and reached the allowlisted host.
  expect(mock.authSeen).toContain(`Bearer ${ROOT_PROD}`);

  await client.close();
  await sse.stop();
  const blob = [...sse.chunks, rootBody, approveBody].join("\n");
  expect(blob).not.toContain(ROOT_PROD);
  expect(blob).not.toContain(MOCK_MINTED_KEY);
});

test("multi-root: parked choice lists BOTH roots value-free → select one → scoped mint on IT", async () => {
  const sse = openSse();
  await new Promise((r) => setTimeout(r, 20));

  // add the SECOND named root → the provider now holds two (prod + staging).
  const rootBody = await postRoot("mock", "staging", ROOT_STAGING);
  const roots = (JSON.parse(rootBody) as { roots: Array<{ label?: string }> }).roots;
  expect(roots.length).toBe(2);
  expect(roots.map((r) => r.label).toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual([
    "prod",
    "staging",
  ]);

  const client = new Client({ name: "multiroot-multi", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const toolResults: string[] = [];
  const proposed = await client.callTool({
    name: "mintKey",
    arguments: { action: mintTemplate("MR_MULTI_KEY"), env: "local" },
  });
  toolResults.push(JSON.stringify(proposed));
  const proposedText = (proposed.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  expect(JSON.parse(proposedText).status).toBe("needs-confirm");
  // discovery was DEFERRED (root ambiguous) → no token/root leaked at propose.
  expect(proposedText).not.toContain(ROOT_PROD);
  expect(proposedText).not.toContain(ROOT_STAGING);

  await new Promise((r) => setTimeout(r, 60));
  const pending = findPending(sse.chunks, "MR_MULTI_KEY");
  expect(pending).not.toBeNull();

  // THE MULTI-ROOT PROOF: the parked choice lists BOTH roots as value-free metadata …
  const offered = pending!.choices.roots;
  expect(offered?.length).toBe(2);
  expect(offered?.map((r) => r.label).toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual(
    ["prod", "staging"],
  );
  // … carrying ids/labels but NEVER a value (structurally — RootInfo has no `value` field).
  expect(JSON.stringify(offered)).not.toContain(ROOT_PROD);
  expect(JSON.stringify(offered)).not.toContain(ROOT_STAGING);
  // resources are deferred until a root is chosen; the permission menu is surfaced up front.
  expect(pending!.choices.resources.length).toBe(0);
  expect(pending!.choices.permissions).toEqual(["sending_access", "full_access"]);

  // the human selects the STAGING root + a resource + the narrow permission.
  const stagingId = offered!.find((r) => r.label === "staging")!.id;
  const authFrom = mock.authSeen.length; // watch only the calls this approve makes
  const approveBody = await (
    await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        nonce: pending!.nonce,
        selection: {
          rootId: stagingId,
          resource: MOCK_DOMAINS[1].id,
          permission: "sending_access",
        },
      }),
    })
  ).text();
  expect(JSON.parse(approveBody).status).toBe("minted");

  // discovery + the mint ran against the SELECTED (staging) root — its value reached the host,
  // the OTHER root's did not.
  const usedAuth = mock.authSeen.slice(authFrom);
  expect(usedAuth).toContain(`Bearer ${ROOT_STAGING}`);
  expect(usedAuth).not.toContain(`Bearer ${ROOT_PROD}`);
  // the mint body was SCOPED to the chosen resource + the narrow permission (never full_access).
  const mintBody = mock.mintSeen.at(-1)!;
  expect(mintBody.domain_id).toBe(MOCK_DOMAINS[1].id);
  expect(mintBody.permission).toBe("sending_access");

  await client.close();
  await sse.stop();

  // THE GUARANTEE: nothing the daemon sent back — MCP, SSE, or REST — carries either root
  // value or the minted key. The choice menu is labels/ids + permission labels only.
  const blob = [...toolResults, ...sse.chunks, rootBody, approveBody].join("\n");
  expect(blob).not.toContain(ROOT_PROD);
  expect(blob).not.toContain(ROOT_STAGING);
  expect(blob).not.toContain(MOCK_MINTED_KEY);
  // positive controls: the value-free evidence DID cross (root labels + var name + status).
  // NOTE: resource NAMES never cross here — discovery is deferred to approve, its results used
  // only internally to validate + scope the mint (even more value-free than the single-root path).
  expect(blob).toContain("staging");
  expect(blob).toContain("MR_MULTI_KEY");
  expect(blob).toContain("minted");
});

test("security: a multi-root mint approved with NO rootId is REJECTED (must pick a root)", async () => {
  const client = new Client({ name: "multiroot-guard", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const sse = openSse();
  await new Promise((r) => setTimeout(r, 20));
  await client.callTool({
    name: "mintKey",
    arguments: { action: mintTemplate("MR_GUARD_KEY"), env: "local" },
  });
  await new Promise((r) => setTimeout(r, 60));
  const pending = findPending(sse.chunks, "MR_GUARD_KEY");
  expect(pending).not.toBeNull();

  // omit rootId though two roots exist → the daemon refuses to silently pick one.
  const rejectBody = await (
    await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        nonce: pending!.nonce,
        selection: { resource: MOCK_DOMAINS[0].id, permission: "sending_access" },
      }),
    })
  ).text();
  const rejected = JSON.parse(rejectBody) as { status: string; reason?: string };
  expect(rejected.status).toBe("rejected");
  expect(rejected.reason).toContain("root selection is required");

  // a fabricated rootId (a compromised dashboard) is also refused — must match an offered id.
  await client.callTool({
    name: "mintKey",
    arguments: { action: mintTemplate("MR_FORGE_KEY"), env: "local" },
  });
  await new Promise((r) => setTimeout(r, 60));
  const forged = findPending(sse.chunks, "MR_FORGE_KEY")!;
  const forgeBody = await (
    await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        nonce: forged.nonce,
        selection: {
          rootId: "not-a-real-root-id",
          resource: MOCK_DOMAINS[0].id,
          permission: "sending_access",
        },
      }),
    })
  ).text();
  expect((JSON.parse(forgeBody) as { status: string }).status).toBe("rejected");

  await client.close();
  await sse.stop();
});
