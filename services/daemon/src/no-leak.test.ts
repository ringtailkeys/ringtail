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

  // let the SSE flush, then stop reading
  await new Promise((r) => setTimeout(r, 50));
  await reader.cancel();
  await pump;
  await client.close();

  const daemonToClient = [...toolResults, ...sseChunks, stepBody].join("\n");
  expect(stepBody).not.toContain(BROWSER_PASTED);
  expect(daemonToClient).not.toContain(BROWSER_PASTED);

  // The paste HELD its value (proves the loop actually ran), but the response is
  // status-only, and NOTHING the daemon sent back carries either secret value.
  expect(JSON.stringify(paste)).not.toContain(PASTED);
  expect(daemonToClient).not.toContain(PASTED);
  expect(daemonToClient).not.toContain(MINTED);

  // Positive control: the surface DID carry the value-free evidence (names + status).
  expect(daemonToClient).toContain("CLOUDFLARE_API_TOKEN"); // the var NAME
  expect(daemonToClient).toContain("synced");
});
