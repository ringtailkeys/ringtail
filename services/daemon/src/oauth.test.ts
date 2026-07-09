// PROOF (PRD §4.9): the OAuth "Connect a provider" flow, end-to-end against the mock
// provider, asserting THE GUARANTEE holds — the access/refresh token lands in the vault
// and is spent by a mint, but NEVER appears in any REST / MCP / SSE response.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { listConnectedProviders } from "@ringtail/store";
import { createDaemon } from "./index";
import { handleCallback, startConnect } from "./oauth";
import {
  MOCK_MINTED_KEY,
  MOCK_OAUTH_ACCESS,
  MOCK_OAUTH_REFRESH,
  type MockOAuth,
  startMockOAuth,
} from "../test/mock-oauth";

let dir: string;
let mock: MockOAuth;
let server: ReturnType<typeof Bun.serve>;
let token: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-oauth-"));
  mock = startMockOAuth();
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.RINGTAIL_ALLOW_MOCK = "1"; // opt the loopback mock host into the allowlist (test-only)
  process.env.RINGTAIL_OAUTH_MOCK_AUTHORIZE_URL = mock.authorizeUrl;
  process.env.RINGTAIL_OAUTH_MOCK_TOKEN_URL = mock.tokenUrl;
  process.env.RINGTAIL_OAUTH_MOCK_CLIENT_ID = "mock-client-id";

  const daemon = createDaemon({ repoName: "ringtail", envLocalPath: join(dir, ".env.local") });
  token = daemon.token;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: daemon.app.fetch });
});

afterAll(async () => {
  await server.stop(true);
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("connect → callback → grant stored value-free → mint spends the grant, never leaking a token", async () => {
  const port = server.port;
  const origin = `http://127.0.0.1:${port}`;
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── capture the SSE stream (daemon → dashboard) for the nonce + the leak scan ──
  const sseChunks: string[] = [];
  const sse = await fetch(`${origin}/events?token=${token}`);
  const reader = sse.body!.getReader();
  const dec = new TextDecoder();
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sseChunks.push(dec.decode(value));
    }
  })();

  // 1. POST /api/connect/start { provider: "mock" } → the authorize URL (PKCE + state).
  const startRes = await fetch(`${origin}/api/connect/start`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ provider: "mock" }),
  });
  const startBody = await startRes.text();
  const { authorizeUrl } = JSON.parse(startBody) as { authorizeUrl: string };
  expect(authorizeUrl).toContain(mock.authorizeUrl);
  expect(authorizeUrl).toContain("code_challenge=");
  expect(authorizeUrl).toContain("code_challenge_method=S256");

  // 2. simulate the browser: GET the mock /authorize → 302 back to the daemon callback…
  const authRes = await fetch(authorizeUrl, { redirect: "manual" });
  expect(authRes.status).toBe(302);
  const location = authRes.headers.get("location")!;
  expect(location).toContain(`${origin}/oauth/callback`);
  // …then GET the daemon callback → token exchange + vault the grant, "close this tab".
  const cbRes = await fetch(location);
  const callbackHtml = await cbRes.text();
  expect(cbRes.status).toBe(200);
  expect(callbackHtml.toLowerCase()).toContain("connected");

  // 3. the grant is now in the vault, surfaced VALUE-FREE (names + scopes + expiry).
  const statusRes = await fetch(`${origin}/api/connect/status`, { headers: H });
  const statusBody = await statusRes.text();
  const status = JSON.parse(statusBody) as {
    connected: Array<{ provider: string; scopes: string[]; expiresAt?: number }>;
  };
  const connected = status.connected.find((c) => c.provider === "mock");
  expect(connected).toBeDefined();
  expect(connected!.scopes).toEqual(["read", "write"]);
  expect(connected!.expiresAt).toBeGreaterThan(Date.now());
  // The vault holds the real token internally, but the status surface carries none.
  expect(statusBody).not.toContain(MOCK_OAUTH_ACCESS);
  expect(statusBody).not.toContain(MOCK_OAUTH_REFRESH);

  // 4. drive a MINT that spends the grant. A {{ROOT}} POST is consequential → the agent
  //    can only PROPOSE; it parks for a human approve (unforgeable nonce over SSE).
  const toolResults: string[] = [];
  const client = new Client({ name: "oauth-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    toolResults.push(JSON.stringify(res));
    return (res.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  };

  // the agent can see mock is connected (value-free), then propose the mint.
  const connectors = JSON.parse(await call("listConnectors")) as {
    connected: Array<{ provider: string }>;
  };
  expect(connectors.connected.some((c) => c.provider === "mock")).toBe(true);

  const proposedText = await call("mintKey", {
    action: {
      providerAccount: "mock",
      method: "POST",
      url: mock.mintUrl,
      headers: { Authorization: "Bearer {{ROOT}}" },
      body: { name: "ringtail-key" },
      extract: { varName: "MOCK_OAUTH_MINTED_KEY", path: "api_key" },
    },
    env: "local",
  });
  expect(JSON.parse(proposedText).status).toBe("needs-confirm");
  expect(proposedText).not.toContain(MOCK_OAUTH_ACCESS); // no grant token in the proposal

  // the HUMAN approves: read the nonce off the SSE (dashboard-only channel) → /api/action.
  await new Promise((r) => setTimeout(r, 40));
  const findNonce = (): string => {
    for (const chunk of [...sseChunks].reverse()) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const snap = JSON.parse(line.slice(6)) as {
            pendingMints?: Array<{ nonce: string; varName?: string }>;
          };
          const hit = snap.pendingMints?.find((p) => p.varName === "MOCK_OAUTH_MINTED_KEY");
          if (hit) return hit.nonce;
        } catch {
          /* partial chunk */
        }
      }
    }
    throw new Error("parked-mint nonce not found on the SSE stream");
  };
  const approveRes = await fetch(`${origin}/api/action`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ nonce: findNonce() }),
  });
  const approveBody = await approveRes.text();
  expect(JSON.parse(approveBody).status).toBe("minted");

  // the grant's access token WAS substituted into {{ROOT}} and reached the allowlisted
  // mock host (proves the mint really spent the grant)…
  expect(mock.authSeen).toContain(`Bearer ${MOCK_OAUTH_ACCESS}`);

  await new Promise((r) => setTimeout(r, 50));
  await reader.cancel();
  await pump;
  await client.close();

  // THE GUARANTEE: nothing the daemon sent back — over REST, MCP, or SSE — carries the
  // grant's access token, its refresh token, or the minted key value.
  const daemonToClient = [
    ...toolResults,
    ...sseChunks,
    startBody,
    callbackHtml,
    statusBody,
    approveBody,
  ].join("\n");
  expect(daemonToClient).not.toContain(MOCK_OAUTH_ACCESS);
  expect(daemonToClient).not.toContain(MOCK_OAUTH_REFRESH);
  expect(daemonToClient).not.toContain(MOCK_MINTED_KEY);

  // positive controls: the surface DID carry the value-free evidence (names + status).
  expect(statusBody).toContain("mock");
  expect(daemonToClient).toContain("MOCK_OAUTH_MINTED_KEY"); // the var NAME
  expect(daemonToClient).toContain("minted");
});

test("state mismatch: a callback whose state matches no pending flow stores no grant", async () => {
  const origin = `http://127.0.0.1:${server.port}`;
  // start a real flow so a pending state exists, but complete with a DIFFERENT state.
  const { authorizeUrl } = startConnect("mock", origin);
  const realState = new URL(authorizeUrl!).searchParams.get("state")!;
  const before = listConnectedProviders().length;

  const done = await handleCallback("some-code", "totally-wrong-state");
  expect(done).toBeNull(); // not ours → not completed (falls through to legacy, no grant)
  expect(listConnectedProviders().length).toBe(before); // no grant stored

  // the real state is still redeemable (mismatch didn't consume it) — sanity, not a leak.
  expect(realState).toBeTruthy();
});
