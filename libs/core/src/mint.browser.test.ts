// BROWSER MINT (Envoyage) — the no-mint-API path, proven against a MOCK Envoyage (a Map of
// tool-name → scripted fn, NO real browser). The loop logic is what's under test; Envoyage itself
// is proven live. Covers both paths the workflow requires:
//   (1) AUTONOMOUS — create-key present, no wall → mint succeeds headless.
//   (2) HANDOFF   — a login wall → pause → emit human-request → poll wait_for_human → resume →
//                   continue → mint. Plus the invariants: consequential (parked, never auto-run),
//                   validate-before-sink, the SAME sink close as an API mint, and — structurally —
//                   the machine NEVER types the password (that's the human's, in the live view).
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStore } from "@ringtail/store";
import {
  type BrowserRecipe,
  browserRecipes,
  driveBrowserMint,
  type EnvoyageClient,
  type EnvoyageResult,
  type HandoffState,
} from "./envoyage";
import {
  approveMintViaBrowser,
  executeBrowserMint,
  isBrowserNonce,
  proposeMintViaBrowser,
} from "./mint";
import { type MockProvider, startMockProvider } from "./mock-provider";

const REPO = "acme";

/**
 * The MOCK Envoyage: implements the EnvoyageClient tool surface with scripted responses. `wall:true`
 * simulates "not signed in" — the first browser_open surfaces a password handoff (Envoyage's
 * highest-priority auto-detect), which clears after the human "hits Continue" (2 wait polls). It
 * NEVER produces a password itself — the human types it in the live view; the mock just gates.
 */
class MockEnvoyage implements EnvoyageClient {
  paused = false;
  closed = false;
  private waits = 0;
  private authed: boolean;
  readonly calls: Array<{ tool: string; args?: Record<string, unknown> }> = [];
  constructor(
    private readonly secret: string,
    private readonly opts: { wall?: boolean; keyId?: string } = {},
  ) {
    this.authed = !opts.wall;
  }
  async call(tool: string, args: Record<string, unknown> = {}): Promise<EnvoyageResult> {
    this.calls.push({ tool, args });
    if (tool === "browser_wait_for_human") {
      // Anti-sleep-loop: not-resumed for a couple polls (the human is solving it), then resumed.
      this.waits++;
      if (this.waits >= 2) {
        this.paused = false;
        this.authed = true;
        return { json: { resumed: true }, paused: false };
      }
      return { json: { resumed: false, timedOut: true }, paused: true };
    }
    if (tool === "browser_screenshot") {
      // Structural password-blindness: a blanked PNG while paused — the model gets nothing to see.
      return { json: { png_base64: this.paused ? "" : "iVBOR" }, paused: this.paused };
    }
    if (tool === "browser_open" && !this.authed) {
      this.paused = true;
      const human = {
        reason: "password",
        instructions: "Type your password in the panel — I can't see it — then hit Continue.",
      };
      return { json: { paused: true, human_request: human }, paused: true, human };
    }
    if (tool === "browser_read_page") {
      return { json: { secret: this.secret, keyId: this.opts.keyId ?? "key_mock_1" } };
    }
    return { json: { ok: true } };
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

let dir: string;
let mock: MockProvider;
// A test-only browser recipe over the `mock` provider (which HAS a recipe.validate) so we can
// prove validate-before-sink. Pushed onto the registry for the run, popped after.
const mockBrowserRecipe: BrowserRecipe = {
  provider: "mock",
  // The mock recipe's validate probes creds["MOCK_API_KEY"], so drive that var name.
  varPrefix: /^MOCK_API_KEY/,
  loginUrl: "http://mock/keys",
  steps: [
    { tool: "browser_open", args: { url: "http://mock/keys" } },
    { tool: "browser_click", args: { text: "Create key" } },
    { tool: "browser_read_page", extract: { path: "secret", idPath: "keyId" } },
  ],
};

function freshOpts(): { repoName: string; env: "local"; envLocalPath: string } {
  const sub = mkdtempSync(join(dir, "proj-"));
  return { repoName: REPO, env: "local", envLocalPath: join(sub, ".env.local") };
}

async function mintMockToken(grant: "full" | "partial"): Promise<string> {
  const res = await fetch(`${mock.url}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant }),
  });
  return ((await res.json()) as { token: string }).token;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-browser-"));
  mock = startMockProvider();
  process.env.RINGTAIL_HOME = join(dir, "home"); // isolate the vault
  process.env.MOCK_PROVIDER_URL = mock.url; // the mock recipe's validate probes this
  browserRecipes.push(mockBrowserRecipe);
});

afterAll(() => {
  const i = browserRecipes.indexOf(mockBrowserRecipe);
  if (i >= 0) browserRecipes.splice(i, 1);
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("AUTONOMOUS: create-key present (no wall) → mint succeeds headless, value-free, sink closed", async () => {
  const evy = new MockEnvoyage("sk-mock-autonomous-XYZ", { wall: false });
  const o = freshOpts();
  const r = await executeBrowserMint("openai", "OPENAI_API_KEY", o, { connect: async () => evy });

  expect(r.status).toBe("minted");
  expect(r.varName).toBe("OPENAI_API_KEY");
  // No human wall was hit on the autonomous path.
  expect(evy.calls.some((c) => c.tool === "browser_wait_for_human")).toBe(false);
  // The SAME sink close as an API mint: value in .env.local, provenance in the vault.
  expect(readFileSync(o.envLocalPath, "utf8")).toContain("OPENAI_API_KEY=sk-mock-autonomous-XYZ");
  const stored = readStore().credentials["OPENAI_API_KEY"];
  expect(stored?.provider).toBe(`ringtail/${REPO}/local/openai`); // auditName provenance
  expect(stored?.keyId).toBe("key_mock_1");
  // THE GUARANTEE: the value-free result never carries the secret.
  expect(JSON.stringify(r)).not.toContain("sk-mock-autonomous-XYZ");
  expect(evy.closed).toBe(true); // session reaped
});

test("HANDOFF: login wall → pause → human-request → poll wait_for_human → resume → mint", async () => {
  const evy = new MockEnvoyage("sk-mock-handoff-ABC", { wall: true });
  const states: Array<[HandoffState, string | undefined]> = [];
  const o = freshOpts();
  const r = await executeBrowserMint("openai", "OPENAI_API_KEY", o, {
    connect: async () => evy,
    onState: (s, ctx) => states.push([s, ctx?.reason]),
  });

  expect(r.status).toBe("minted");
  // The full state machine fired.
  const seen = states.map((s) => s[0]);
  for (const s of ["DRIVING", "HUMAN_NEEDED", "PAUSED", "RESUMED"] as HandoffState[]) {
    expect(seen).toContain(s);
  }
  // The handoff reason is the password wall (Envoyage's highest-priority auto-detect).
  expect(states.find((s) => s[0] === "HUMAN_NEEDED")?.[1]).toBe("password");
  // Poll-not-sleep: wait_for_human was polled (and re-called on timeout).
  expect(
    evy.calls.filter((c) => c.tool === "browser_wait_for_human").length,
  ).toBeGreaterThanOrEqual(2);
  // STRUCTURAL password-blindness: the machine never clicked/typed until AFTER the human resumed —
  // the only tool it ran while paused was wait_for_human.
  const lastWait = evy.calls.map((c) => c.tool).lastIndexOf("browser_wait_for_human");
  const firstClick = evy.calls.findIndex((c) => c.tool === "browser_click");
  expect(firstClick).toBeGreaterThan(lastWait);
  // The machine DID type — but only a non-secret field (the key's name), never a password/OTP.
  const typed = evy.calls.filter((c) => c.tool === "browser_form_input");
  expect(typed.every((c) => !/pass|otp|secret/i.test(String(c.args?.label ?? "")))).toBe(true);
  // Value-free throughout the narration + result.
  expect(JSON.stringify({ r, states })).not.toContain("sk-mock-handoff-ABC");
});

test("password-blindness at the source: the PNG is blanked while paused (model is blind)", async () => {
  const evy = new MockEnvoyage("x", { wall: true });
  await evy.call("browser_open"); // hits the login wall → paused
  const shot = await evy.call("browser_screenshot");
  expect(shot.json.png_base64).toBe(""); // no bytes for the model to read the password from
});

test("CONSEQUENTIAL: mintViaBrowser parks under a nonce and does NOT auto-run; approve executes it", async () => {
  const o = freshOpts();
  const { result, pending } = await proposeMintViaBrowser("openai", "OPENAI_API_KEY", o);
  expect(result.status).toBe("needs-confirm");
  expect(result.id).toBeTruthy();
  expect(pending?.nonce).toBeTruthy();
  expect(pending?.browser).toBe(true);
  expect(isBrowserNonce(pending!.nonce)).toBe(true);
  // Nothing executed on propose — no browser spun up, no sink write.
  expect(existsSync(o.envLocalPath)).toBe(false);
  // The needs-confirm result carries no nonce (that goes to the dashboard only).
  expect(JSON.stringify(result)).not.toContain(pending!.nonce);

  // The human approves by the nonce → NOW it drives + files.
  const evy = new MockEnvoyage("sk-approved-1", { wall: false });
  const r = await approveMintViaBrowser(pending!.nonce, { connect: async () => evy });
  expect(r.status).toBe("minted");
  expect(readFileSync(o.envLocalPath, "utf8")).toContain("OPENAI_API_KEY=sk-approved-1");
  // Single-use: the nonce is gone.
  expect(isBrowserNonce(pending!.nonce)).toBe(false);
  const again = await approveMintViaBrowser(pending!.nonce, { connect: async () => evy });
  expect(again.status).toBe("rejected");
});

test("VALIDATE-before-sink: a valid-scope minted token validates → files; wrong-scope → NOT synced", async () => {
  // Happy: the browser reads back a full-scope token → recipe.validate passes → filed.
  const good = await mintMockToken("full");
  const oGood = freshOpts();
  const rGood = await executeBrowserMint("mock", "MOCK_API_KEY", oGood, {
    connect: async () => new MockEnvoyage(good, { wall: false }),
  });
  expect(rGood.status).toBe("minted");
  expect(readFileSync(oGood.envLocalPath, "utf8")).toContain("MOCK_API_KEY=");

  // Wrong-scope: an under-scoped token → validate catches it BEFORE any sink write.
  const partial = await mintMockToken("partial");
  const oBad = freshOpts();
  const rBad = await executeBrowserMint("mock", "MOCK_API_KEY", oBad, {
    connect: async () => new MockEnvoyage(partial, { wall: false }),
  });
  expect(rBad.status).toBe("wrong-scope");
  expect(rBad.reason).toContain("write"); // the missing scope
  expect(existsSync(oBad.envLocalPath)).toBe(false); // nothing synced on wrong-scope
});

test("STRUCTURAL trust rule: a recipe that tries to type a password is refused before any tool call", async () => {
  const evy = new MockEnvoyage("x", { wall: false });
  const passwordRecipe: BrowserRecipe = {
    provider: "x",
    varPrefix: /^X/,
    loginUrl: "http://x/login",
    steps: [{ tool: "browser_form_input", args: { label: "Password", value: "hunter2" } }],
  };
  const out = await driveBrowserMint(evy, passwordRecipe);
  expect("error" in out && out.error).toContain("password");
  expect(evy.calls.length).toBe(0); // refused UP FRONT — the tool never even ran
});
