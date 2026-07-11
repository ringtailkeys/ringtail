/**
 * CLOUD BROWSER-MINT — drive a Cloudflare browser over CDP DIRECTLY from Ringtail TS, with NO
 * Envoyage service in the path (the paid tier). This is `connectEnvoyage`'s sibling behind the same
 * `BrowserMinter` door (envoyage.ts): `driveBrowserMint` / `isSecretInput` / `browserRecipes` /
 * the whole propose→approve→executeBrowserMint→fileMinted chain are REUSED VERBATIM — only the
 * transport differs.
 *
 * WHY not run Envoyage in the cloud too: Envoyage's cross-process session routing is unimplemented
 * (a hosted multi-tenant Rust engine would need hand-orchestrated one-process-per-session +
 * browser.lock), it ships no darwin-x64 binary, and CF already owns the browser lifecycle
 * (close == ws.close()). So the cloud path drives CF's CDP endpoint straight.
 *
 * SECURITY: dropping Envoyage means dropping its NATIVE (Rust) password-blinding, so THIS FILE now
 * owns that trust boundary in TS. The two load-bearing pieces — the HUMAN_NEEDED_JS probe (ported
 * char-for-char from Envoyage src/browser.rs) and the model-suppression rule (no screenshot bytes
 * while a human wall is up) — carry their own dedicated test (mint.cloud.test.ts).
 */
import { getEnv, type Env } from "@ringtail/config";
import type { BrowserMinter, BrowserResult } from "./envoyage";

/**
 * The ONE CDP command seam a test mocks — no live WebSocket, no live CF browser. A real cloud run
 * backs this with a WebSocket to the CF browser's CDP endpoint (see `connectCfCdp`); a test backs
 * it with a Map of method → scripted response, so the mapper + probe + suppression are proven with
 * NO browser at all.
 */
export interface Cdp {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): void;
}

/**
 * In-page probe for a "human must take over" state — PORTED CHAR-FOR-CHAR from Envoyage
 * (src/browser.rs::HUMAN_NEEDED_JS). Returns JSON `{kind}` where kind ∈
 * password|captcha|cloudflare|oauth, or `{}` when clear. Password is HIGHEST priority: a password
 * field must never reach the model. Defensive — any error yields `{}`. This is the security
 * boundary; it is copied, not paraphrased, so the audited Rust detection and the TS detection stay
 * bit-identical. ponytail: one probe covers all four walls — per-case CDP domains would be far
 * more code for no more accuracy on the pages that actually loop the agent.
 */
const HUMAN_NEEDED_JS = `(() => {
  try {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    const q = (sel) => { try { return !!document.querySelector(sel); } catch (e) { return false; } };
    const bodyText = (document.body && document.body.innerText || '').slice(0, 4000);

    // Password entry — highest priority; passwords must never reach the AI.
    const pw = document.querySelector('input[type=password]');
    if (pw) {
      const r = pw.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return JSON.stringify({ kind: 'password' });
    }

    // CAPTCHA widgets.
    if (q('iframe[src*="recaptcha"]') || q('iframe[src*="hcaptcha"]')) {
      return JSON.stringify({ kind: 'captcha' });
    }

    // Cloudflare / Turnstile bot-check.
    if (host === 'challenges.cloudflare.com'
        || q('iframe[src*="challenges.cloudflare.com"]')
        || q('.cf-turnstile')
        || q('#challenge-running')
        || /verify you are human|checking your browser/i.test(bodyText)) {
      return JSON.stringify({ kind: 'cloudflare' });
    }

    // OAuth / sign-in consent — generic, lowest priority.
    const oauthHosts = ['accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com'];
    const isOauthHost = oauthHosts.includes(host)
      || (host === 'github.com' && /\\/login|\\/session/.test(path));
    if (isOauthHost && /oauth|authorize|login|signin/i.test(path)) {
      return JSON.stringify({ kind: 'oauth' });
    }

    return '{}';
  } catch (e) {
    return '{}';
  }
})()`;

/** Envoyage's canned human-facing instructions per wall (ported from HandoffReason::instructions). */
const HANDOFF_INSTRUCTIONS: Record<string, string> = {
  password: "Type your password in the panel (the AI can't see it), then click ▶ Continue.",
  captcha: "Solve the CAPTCHA in the panel, then click ▶ Continue.",
  cloudflare: "Clear the Cloudflare check in the panel, then click ▶ Continue.",
  oauth: "Complete the sign-in / consent in the panel, then click ▶ Continue.",
};

/** Run one `Runtime.evaluate` (returnByValue) and hand back the raw `.result.value`. */
async function evalValue(cdp: Cdp, expression: string): Promise<unknown> {
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
  const result = res.result as { value?: unknown } | undefined;
  return result?.value;
}

/** The handoff probe: run HUMAN_NEEDED_JS, map `kind` → a wall reason, or null when clear. */
async function probeHumanNeeded(cdp: Cdp): Promise<string | null> {
  try {
    const raw = await evalValue(cdp, HUMAN_NEEDED_JS);
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}") as { kind?: string };
    const kind = parsed.kind;
    return kind && kind in HANDOFF_INSTRUCTIONS ? kind : null;
  } catch {
    return null; // a broken probe re-runs on the next navigating step — never strands the mint
  }
}

/**
 * Build a `BrowserResult` for a navigating step, running the handoff probe AFTER the action. When a
 * wall is up this returns `{human, paused}` and — CRITICALLY — NO screenshot bytes ride in `json`
 * (model-suppression: the model must never receive an image of the password page). When clear it's
 * a plain `{json:{ok:true, url}}`.
 */
async function navResult(cdp: Cdp, json: Record<string, unknown>): Promise<BrowserResult> {
  const reason = await probeHumanNeeded(cdp);
  if (!reason) return { json };
  const human = { reason, instructions: HANDOFF_INSTRUCTIONS[reason] };
  // Value-free, screenshot-free: only the reason + instructions cross to the model.
  return { json: { paused: true, human_request: human }, human, paused: true };
}

/**
 * Map ONE `browser_*` tool call → CDP commands over `cdp`, tracking a `paused` flag so screenshots
 * stay blanked until the human clears the wall. This is the whole cloud backend — everything above
 * `driveBrowserMint` is reused unchanged.
 */
function makeCloudMinter(cdp: Cdp): BrowserMinter {
  let paused = false;
  return {
    async call(tool, args = {}): Promise<BrowserResult> {
      switch (tool) {
        case "browser_open": {
          await cdp.send("Page.navigate", { url: String(args.url ?? "") });
          const r = await navResult(cdp, { ok: true, url: args.url });
          paused = r.paused === true;
          return r;
        }
        case "browser_click": {
          // Click by visible text — the recipe's addressing (mirrors Envoyage's ref/text click).
          const text = JSON.stringify(String(args.text ?? ""));
          await evalValue(
            cdp,
            `(() => { const t=${text}; const el=[...document.querySelectorAll('button,a,[role=button],input[type=submit]')].find(e=>(e.innerText||e.value||'').trim().includes(t)); if(el){el.click();return true;} return false; })()`,
          );
          const r = await navResult(cdp, { ok: true });
          paused = r.paused === true;
          return r;
        }
        case "browser_form_input": {
          // NON-secret fields only — driveBrowserMint's isSecretInput has already refused any
          // password/OTP field before this runs. Set the value on the labeled input.
          const label = JSON.stringify(String(args.label ?? ""));
          const value = JSON.stringify(String(args.value ?? ""));
          await evalValue(
            cdp,
            `(() => { const lbl=${label}; const el=[...document.querySelectorAll('input,textarea')].find(e=>((e.labels&&e.labels[0]&&e.labels[0].innerText)||e.name||e.placeholder||'').includes(lbl)); if(el){el.value=${value};el.dispatchEvent(new Event('input',{bubbles:true}));return true;} return false; })()`,
          );
          return { json: { ok: true } };
        }
        case "browser_read_page": {
          // Scrape the result page for the minted value — DAEMON-LOCAL, returnByValue. The recipe's
          // `extract` path pulls the field out of this JSON; the raw value never reaches the model.
          const val = await evalValue(
            cdp,
            `(() => { const el=document.querySelector('[data-secret],code,pre,input[readonly]'); return JSON.stringify({ secret: el ? (el.value||el.innerText||'').trim() : '', keyId: (document.querySelector('[data-key-id]')||{}).textContent||'' }); })()`,
          );
          try {
            return { json: JSON.parse(typeof val === "string" ? val : "{}") };
          } catch {
            return { json: {} };
          }
        }
        case "browser_wait_for_human": {
          // Anti-sleep-loop: re-PROBE. The human types the password straight into the CF page (frames
          // stream to the cockpit), so the password field disappearing IS the resume signal.
          const still = await probeHumanNeeded(cdp);
          paused = still !== null;
          return paused
            ? { json: { resumed: false, timedOut: true }, paused: true }
            : { json: { resumed: true }, paused: false };
        }
        case "browser_screenshot": {
          // MODEL-SUPPRESSION: no bytes while a wall is up — the model can never read the password
          // off a screenshot. This is the TS twin of Envoyage's Rust screenshot-blanking.
          if (paused) return { json: { png_base64: "" }, paused: true };
          const shot = await cdp.send("Page.captureScreenshot", {});
          return { json: { png_base64: (shot.data as string) ?? "" } };
        }
        default:
          return { json: { ok: true } };
      }
    },
    async close(): Promise<void> {
      // close == drop the CDP socket. NEVER kill the CF browser — CF owns its lifecycle; a spawned
      // local Envoyage is the only backend that reaps a child.
      cdp.close();
    },
  };
}

/**
 * Acquire a live CDP `Cdp` against a real Cloudflare browser. GATED on CF creds. Live-only, verified
 * separately with real creds (does NOT block the mockable core — tests inject a mock `Cdp`).
 *
 * TODO(live-cf): fill in the connectionUrl acquisition. Cloudflare Browser Rendering does not expose
 * a public raw-CDP `wss` to external clients without a Worker binding, so this needs one of:
 *   (a) a thin CF Worker using `@cloudflare/puppeteer` that returns `browser.wsEndpoint()`, or
 *   (b) the Browser Rendering REST session endpoint once it exposes a CDP URL.
 * Exact wiring once a `wss://…` connectionUrl is in hand: `return new WsCdp(await attach(url))` where
 * WsCdp is a StreamableHTTP-free WebSocket with an id→promise map, and `attach` runs
 * Target.setDiscoverTargets → Target.getTargets(newest page) → Target.attachToTarget{flatten:true},
 * pinning the returned sessionId onto every subsequent send (ported from Envoyage
 * browser.rs::attach_page/attach_target). Until then, the cloud SHIP is blocked here — Increments
 * 1-2 prove out on the mock `Cdp` + a single local Envoyage.
 */
async function connectCfCdp(env: Env): Promise<Cdp> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    throw new Error("cloud browser-mint needs CF_ACCOUNT_ID + CF_API_TOKEN (Browser Rendering)");
  }
  throw new Error(
    "cloud CDP not yet wired to a live Cloudflare browser — see connectCfCdp TODO(live-cf). " +
      "The mockable core (mapper + HUMAN_NEEDED_JS probe + model-suppression) is proven in " +
      "mint.cloud.test.ts; the local Envoyage backend (RINGTAIL_BROWSER_MODE=local) is the shippable path.",
  );
}

/**
 * The CLOUD `BrowserMinter` — drives a Cloudflare browser over CDP directly. Inject `deps.cdp` in
 * tests (no browser); real runs acquire a live CF CDP endpoint. Same door as `connectEnvoyage`.
 */
export async function connectCloudBrowser(
  env: Env = getEnv(),
  deps: { cdp?: Cdp } = {},
): Promise<BrowserMinter> {
  const cdp = deps.cdp ?? (await connectCfCdp(env));
  return makeCloudMinter(cdp);
}
