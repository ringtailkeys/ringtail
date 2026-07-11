// CLOUD BROWSER MINT (CF-CDP direct) — the SECURITY-CRITICAL boundary Ringtail now owns in TS
// (the cloud path drops Envoyage's native Rust password-blinding). Proven against a MOCK Cdp — a
// Map of CDP method → scripted response, NO live WebSocket and NO live Cloudflare browser. What's
// under test is the port: the HUMAN_NEEDED_JS handoff probe + the model-suppression rule (no
// screenshot bytes while a human wall is up) + the tool→CDP mapper. The live CF acquisition
// (connectCfCdp) is gated on real creds and verified separately — it does NOT block this core.
import { expect, test } from "bun:test";
import { getEnv, resetEnv } from "@ringtail/config";
import { browserRecipes, driveBrowserMint, type HandoffState } from "./envoyage";
import { type Cdp, connectCloudBrowser } from "./cloud-browser";

/**
 * MOCK Cdp: answers the handful of CDP calls the cloud mapper makes. It can't run JS, so it
 * dispatches on the `Runtime.evaluate` expression: the HUMAN_NEEDED_JS probe (contains
 * `input[type=password]`) reports the wall; the read-page eval (contains `data-secret`) returns the
 * scripted minted value; anything else (click/type) returns true. `wall:true` = "not signed in":
 * the FIRST probe reports a password wall, then clears (the human "typed it in the CF page") so the
 * next probe comes back empty — mirroring the real resume signal (the password field disappears).
 */
class MockCdp implements Cdp {
  closed = false;
  private probes = 0;
  constructor(
    private readonly secret: string,
    private readonly opts: { wall?: boolean; keyId?: string } = {},
  ) {}
  async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    if (method === "Page.navigate") return {};
    if (method === "Page.captureScreenshot") return { data: "iVBOR-real-bytes" };
    if (method === "Runtime.evaluate") {
      const expr = String(params.expression ?? "");
      if (expr.includes("input[type=password]")) {
        // The handoff probe. Walled on the first probe, cleared thereafter.
        this.probes++;
        const walled = this.opts.wall && this.probes < 2;
        return { result: { value: JSON.stringify(walled ? { kind: "password" } : {}) } };
      }
      if (expr.includes("data-secret")) {
        return {
          result: {
            value: JSON.stringify({ secret: this.secret, keyId: this.opts.keyId ?? "key_cloud_1" }),
          },
        };
      }
      return { result: { value: true } }; // click / form_input
    }
    return {};
  }
  close(): void {
    this.closed = true;
  }
}

const OPENAI = "https://platform.openai.com/api-keys";

test("MODEL-SUPPRESSION: a password wall → human handoff carries NO screenshot bytes to the model", async () => {
  const cdp = new MockCdp("sk-secret-1", { wall: true });
  const m = await connectCloudBrowser(getEnv(), { cdp });
  const r = await m.call("browser_open", { url: OPENAI });

  expect(r.human?.reason).toBe("password");
  expect(r.paused).toBe(true);
  // THE BOUNDARY: the navigating result that surfaced the wall ships no image/png/screenshot field.
  expect(JSON.stringify(r.json)).not.toMatch(/png|screenshot|iVBOR|base64/i);
  // And any screenshot the agent asks for while paused is BLANK — it can never read the password.
  const shot = await m.call("browser_screenshot");
  expect(shot.json.png_base64).toBe("");
});

test("no wall → clean result + real screenshot bytes flow (suppression only bites while paused)", async () => {
  const cdp = new MockCdp("sk-secret-2", { wall: false });
  const m = await connectCloudBrowser(getEnv(), { cdp });
  const r = await m.call("browser_open", { url: OPENAI });
  expect(r.human).toBeUndefined();
  expect(r.paused).toBeUndefined();
  const shot = await m.call("browser_screenshot");
  expect(shot.json.png_base64).toBe("iVBOR-real-bytes");
});

test("close() drops the CDP socket — it NEVER kills the Cloudflare browser (CF owns its lifecycle)", async () => {
  const cdp = new MockCdp("z");
  const m = await connectCloudBrowser(getEnv(), { cdp });
  await m.close();
  expect(cdp.closed).toBe(true);
});

test("HANDOFF LOOP on the cloud backend: wall → pause → resume → mint, value-free throughout", async () => {
  const cdp = new MockCdp("sk-cloud-MINTED", { wall: true });
  const m = await connectCloudBrowser(getEnv(), { cdp });
  const recipe = browserRecipes.find((r) => r.provider === "openai");
  if (!recipe) throw new Error("openai recipe missing");
  const states: Array<[HandoffState, string | undefined]> = [];

  const out = await driveBrowserMint(m, recipe, (s, ctx) => states.push([s, ctx?.reason]));

  expect("value" in out && out.value).toBe("sk-cloud-MINTED");
  expect("keyId" in out && out.keyId).toBe("key_cloud_1");
  // The full handoff state machine fired against the REAL cloud mapper (not a mock BrowserMinter).
  for (const s of ["DRIVING", "HUMAN_NEEDED", "PAUSED", "RESUMED"] as HandoffState[]) {
    expect(states.map((x) => x[0])).toContain(s);
  }
  expect(states.find((x) => x[0] === "HUMAN_NEEDED")?.[1]).toBe("password");
  // Value-free narration: the minted secret never rides in the state stream.
  expect(JSON.stringify(states)).not.toContain("sk-cloud-MINTED");
});

test("HONEST STUB: the live CF path is gated on CF creds — the mockable core does not need them", async () => {
  resetEnv();
  // No CF_ACCOUNT_ID / CF_API_TOKEN, no injected cdp → the live path must refuse with a clear error.
  let err: unknown;
  try {
    await connectCloudBrowser(getEnv({ RINGTAIL_BROWSER_MODE: "cloud" }));
  } catch (e) {
    err = e;
  }
  expect(String(err)).toMatch(/CF_ACCOUNT_ID/);
  resetEnv();
});
