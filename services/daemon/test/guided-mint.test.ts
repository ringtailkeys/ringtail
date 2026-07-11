// PROOF (PRD §4.5): the GUIDED least-privilege mint, end-to-end against the mock provider.
// The full path: discovery enumerates ≥2 resources (value-free) → a choice is parked +
// surfaced over SSE (names + permission menu, no secret) → the human selects
// {resource, permission, expiry} → the authored mint is SCOPED to that pick (the mint BODY
// carries the chosen resource + the NARROW permission, never full_access) → it parks
// needs-confirm → nonce approve → minted, value-free. Plus: if a real full-access Resend
// root is in ~/.ringtail, discovery runs LIVE against api.resend.com/domains, value-free.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type MintChoices, runDiscovery } from "@ringtail/core";
import { resolveRoot } from "@ringtail/store";
import { createDaemon } from "../src/index";
import {
  MOCK_DOMAINS,
  MOCK_MINTED_KEY,
  MOCK_OAUTH_ACCESS,
  MOCK_OAUTH_REFRESH,
  type MockOAuth,
  startMockOAuth,
} from "./mock-oauth";

let dir: string;
let mock: MockOAuth;
let server: ReturnType<typeof Bun.serve>;
let token: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-guided-"));
  mock = startMockOAuth();
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.RINGTAIL_ALLOW_MOCK = "1"; // opt the loopback mock host into the allowlist (test-only)
  process.env.RINGTAIL_OAUTH_MOCK_AUTHORIZE_URL = mock.authorizeUrl;
  process.env.RINGTAIL_OAUTH_MOCK_TOKEN_URL = mock.tokenUrl;
  process.env.RINGTAIL_OAUTH_MOCK_CLIENT_ID = "mock-client-id";
  process.env.RINGTAIL_DISCOVERY_MOCK_URL = mock.domainsUrl; // the mock's discovery GET

  const daemon = createDaemon({ repoName: "ringtail", envLocalPath: join(dir, ".env.local") });
  token = daemon.token;
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: daemon.app.fetch });
});

afterAll(async () => {
  await server.stop(true);
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("guided path: discover ≥2 resources → parked choice (value-free) → scoped mint, never full_access", async () => {
  const origin = `http://127.0.0.1:${server.port}`;
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── capture the SSE stream (daemon → dashboard): the choice menu + the nonce live here ──
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

  // 0. connect the mock provider so a grant is vaulted (the root the mint + discovery spend).
  const startBody = await (
    await fetch(`${origin}/api/connect/start`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ provider: "mock" }),
    })
  ).text();
  const { authorizeUrl } = JSON.parse(startBody) as { authorizeUrl: string };
  const location = (await fetch(authorizeUrl, { redirect: "manual" })).headers.get("location")!;
  const callbackHtml = await (await fetch(location)).text();
  expect(callbackHtml.toLowerCase()).toContain("connected");

  // ── capture every tool result (daemon → agent) ──
  const toolResults: string[] = [];
  const client = new Client({ name: "guided-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    toolResults.push(JSON.stringify(res));
    return (res.content as Array<{ text?: string }>)?.[0]?.text ?? "{}";
  };

  // 1. the agent proposes a SCOPED-MINT TEMPLATE with discover:true. It does NOT hardcode a
  //    resource or full_access — it leaves {{RESOURCE}}/{{PERMISSION}}/{{EXPIRY}} for the human.
  const mintTemplate = {
    providerAccount: "mock",
    method: "POST",
    url: mock.mintUrl,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: {
      name: "ringtail-key",
      permission: "{{PERMISSION}}",
      domain_id: "{{RESOURCE}}",
      expires_at: "{{EXPIRY}}",
    },
    extract: { varName: "GUIDED_MINT_KEY", path: "api_key" },
    discover: true,
  };
  const proposedText = await call("mintKey", { action: mintTemplate, env: "local" });
  const proposed = JSON.parse(proposedText) as { status: string };
  expect(proposed.status).toBe("needs-confirm"); // a {{ROOT}} POST is consequential → parked
  expect(proposedText).not.toContain(MOCK_OAUTH_ACCESS); // discovery ran, but no token leaked

  // 2. the parked CHOICE is surfaced value-free over SSE: read the discovered menu + the nonce.
  await new Promise((r) => setTimeout(r, 60)); // let the parked-mint snapshot flush to SSE
  const findPending = (): { nonce: string; choices: MintChoices } => {
    for (const chunk of [...sseChunks].reverse()) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const snap = JSON.parse(line.slice(6)) as {
            pendingMints?: Array<{ nonce: string; varName?: string; choices?: MintChoices }>;
          };
          const hit = snap.pendingMints?.find((p) => p.varName === "GUIDED_MINT_KEY");
          if (hit?.choices) return { nonce: hit.nonce, choices: hit.choices };
        } catch {
          /* partial chunk */
        }
      }
    }
    throw new Error("parked guided-mint choice not found on the SSE stream");
  };
  const { nonce, choices } = findPending();

  // discovery enumerated ≥2 real resources, value-free (names + ids, no secret) …
  expect(choices.resources.length).toBeGreaterThanOrEqual(2);
  expect(choices.resources.map((r) => r.name)).toContain(MOCK_DOMAINS[1].name);
  // … and offered the least-privilege menu with the NARROWEST as the suggested default.
  expect(choices.permissions).toEqual(["sending_access", "full_access"]);
  expect(choices.suggestedPermission).toBe("sending_access");
  expect(choices.supportsExpiry).toBe(true);

  // 3. the HUMAN steers: pick the SECOND domain + the narrow permission + an expiry, and
  //    approve by posting the selection alongside the unforgeable nonce (dashboard-only).
  const selection = {
    resource: MOCK_DOMAINS[1].id,
    permission: "sending_access",
    expiry: "2027-01-01",
  };
  const approveBody = await (
    await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ nonce, selection }),
    })
  ).text();
  expect(JSON.parse(approveBody).status).toBe("minted");

  // 4. THE SCOPED-MINT PROOF: the authored mint body carried the CHOSEN resource + the NARROW
  //    permission + the expiry — never a blanket full_access.
  const mintBody = mock.mintSeen.at(-1)!;
  expect(mintBody.permission).toBe("sending_access");
  expect(mintBody.permission).not.toBe("full_access");
  expect(mintBody.domain_id).toBe(MOCK_DOMAINS[1].id);
  expect(mintBody.expires_at).toBe("2027-01-01");
  // the grant token was substituted into {{ROOT}} and reached the allowlisted host.
  expect(mock.authSeen).toContain(`Bearer ${MOCK_OAUTH_ACCESS}`);

  // 5. a SECOND guided mint WITHOUT expiry proves the unfilled-{{EXPIRY}} field is dropped
  //    (never shipped as a literal placeholder). A fresh varName so idempotency doesn't reuse.
  await call("mintKey", {
    action: { ...mintTemplate, extract: { varName: "GUIDED_MINT_KEY_2", path: "api_key" } },
    env: "local",
  });
  await new Promise((r) => setTimeout(r, 60));
  const findNonce = (varName: string): string => {
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
          /* partial */
        }
      }
    }
    throw new Error(`parked nonce for ${varName} not found`);
  };
  await fetch(`${origin}/api/action`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      nonce: findNonce("GUIDED_MINT_KEY_2"),
      selection: { resource: MOCK_DOMAINS[0].id, permission: "sending_access" },
    }),
  });
  const secondBody = mock.mintSeen.at(-1)!;
  expect(secondBody.domain_id).toBe(MOCK_DOMAINS[0].id);
  expect("expires_at" in secondBody).toBe(false); // unfilled {{EXPIRY}} was dropped

  await new Promise((r) => setTimeout(r, 50));
  await reader.cancel();
  await pump;
  await client.close();

  // THE GUARANTEE: nothing the daemon sent back — REST, MCP, or SSE — carries a token or the
  // minted value. The choice menu is names/ids + permission labels only.
  const daemonToClient = [...toolResults, ...sseChunks, startBody, approveBody].join("\n");
  expect(daemonToClient).not.toContain(MOCK_OAUTH_ACCESS);
  expect(daemonToClient).not.toContain(MOCK_OAUTH_REFRESH);
  expect(daemonToClient).not.toContain(MOCK_MINTED_KEY);
  // positive controls: the value-free evidence DID cross (resource NAME + var NAME + status).
  expect(daemonToClient).toContain(MOCK_DOMAINS[1].name);
  expect(daemonToClient).toContain("GUIDED_MINT_KEY");
  expect(daemonToClient).toContain("minted");
});

// A guided mint against an UNGUIDED provider (no discovery spec) is refused value-free —
// never parked with unfillable {{RESOURCE}}/{{PERMISSION}} placeholders.
test("discover:true with no spec is rejected value-free (never parks an unscoped mint)", async () => {
  const disc = await runDiscovery("neon"); // neon has no discovery spec
  expect("status" in disc && disc.status).toBe("rejected");
});

// LIVE (best-effort): if a real full-access Resend root sits in ~/.ringtail, run discovery
// against api.resend.com/domains and show the real domains enumerated VALUE-FREE. Skipped
// (not failed) when no root is present or the key can't list domains — an OSS clone has none.
test("live resend discovery enumerates real domains value-free (skipped if no root)", async () => {
  const savedHome = process.env.RINGTAIL_HOME;
  delete process.env.RINGTAIL_HOME; // read the REAL ~/.ringtail vault, not the temp one
  try {
    const root = resolveRoot("resend");
    if (!root) {
      console.log("[live-resend] no resend root in ~/.ringtail — skipping live discovery");
      return;
    }
    const disc = await runDiscovery("resend");
    if ("status" in disc) {
      // A send-only key can't list /domains — report the value-free reason, don't hard-fail.
      console.log(`[live-resend] discovery did not enumerate: ${disc.reason}`);
      expect(disc.reason && !disc.reason.includes(root)).toBe(true); // never leak the key
      return;
    }
    console.log(
      `[live-resend] enumerated ${disc.resources.length} domain(s): ${disc.resources
        .map((r) => r.name)
        .join(", ")}`,
    );
    expect(Array.isArray(disc.resources)).toBe(true);
    expect(disc.permissions).toEqual(["sending_access", "full_access"]);
    // THE GUARANTEE, live: the real root key never appears in the value-free menu.
    expect(JSON.stringify(disc)).not.toContain(root);
  } finally {
    if (savedHome !== undefined) process.env.RINGTAIL_HOME = savedHome;
  }
});
