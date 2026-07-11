/**
 * ENVOYAGE — browser-mint over the published `@envoyage/browser` SDK (the no-mint-API path). When a
 * provider has no management API to mint a token, Ringtail drives its web CONSOLE with a real
 * browser to produce the credential — the value lands through the SAME validate + sink close an API
 * mint uses (see mint.ts::executeBrowserMint), so THE GUARANTEE (the value never leaves the daemon)
 * holds for free.
 *
 * Ringtail CONSUMES a running Envoyage ENGINE (`envoyage serve`) via the SDK's `createSession`: a
 * fetch+SSE client that POSTs `browser_*` tools and reads the per-session live-view SSE stream. The
 * ENGINE owns all driving + native human-needed detection + password-blinding — so the
 * password-blind boundary lives OFF Ringtail and IN the engine (we DELETED the old ported CF-CDP
 * probe). Both browser modes are the SAME SDK client, differing only by endpoint (deploy model,
 * `~/Development/envoyage/docs/service-design.md`): `local` (OSS) points at a local `envoyage serve`
 * (spawned via the SDK's `launch()` when no URL is set); `cloud` (paid) points at the hosted
 * Envoyage endpoint. Neither passes a real `cdpUrl` — the `"local"` sentinel tells the SDK to send
 * NO `x-envoyage-cdp-url` header, so the ENGINE owns the browser (local Chromium / hosted CF).
 */
import { createSession, type BrowserSession } from "@envoyage/browser";
import { launch } from "@envoyage/browser/launch";
import { getEnv, type Env } from "@ringtail/config";

/**
 * The value-free result of one browser tool call, as the DAEMON-LOCAL driver sees it. `json` is
 * the parsed tool payload; `human`/`paused` mirror the ENGINE's native handoff detection (it
 * blanks the screenshot + pauses on a password/CAPTCHA/OAuth wall — the model gets text only,
 * structurally blind to the secret the human is about to type). Surfaced from the SDK's
 * `human-needed`/`state` SSE events (same events LiveView.tsx reads), never a re-run in-page probe.
 */
export interface BrowserResult {
  json: Record<string, unknown>;
  /** The engine flagged a human wall on this step (password/CAPTCHA/Cloudflare/OAuth, or a
   *  proactive request). Highest-priority auto-detect is the password field. */
  human?: { reason: string; instructions?: string };
  /** The engine's `paused` flag — true from a detected wall until the human hits ▶ Continue. */
  paused?: boolean;
}

/**
 * The browser-mint surface — the subset of the engine's `browser_*` tools the mint driver
 * (`driveBrowserMint`) uses, behind ONE `call` door. ONE backend implements it now:
 * `connectBrowserMinter` builds it from the SDK's `createSession` for BOTH modes (local + cloud),
 * differing only by endpoint. Tests drive a mock that implements this interface directly (a Map of
 * tool-name → scripted fn), so the loop logic is proven with NO real browser and NO SDK.
 */
export interface BrowserMinter {
  call(tool: string, args?: Record<string, unknown>): Promise<BrowserResult>;
  close(): Promise<void>;
}

/**
 * The live-view sinks the daemon passes so the SDK session's `frame`/`cursor` SSE events land on the
 * cockpit snapshot (pushed out over the daemon's existing `/events` channel). Value-free: a masked
 * page image + a cursor position, never a secret. Latest-only — the daemon keeps just the newest.
 */
export interface LiveViewSinks {
  onFrame?: (frame: { pngBase64: string; seq: number }) => void;
  onCursor?: (cursor: { x: number; y: number }) => void;
}

/** Walk a dot-path into a parsed JSON value; undefined if any hop is missing. */
function pluck(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** The `cdpUrl` sentinel meaning "engine owns the browser". The SDK sends NO `x-envoyage-cdp-url`
 * header for `"local"` (see @envoyage/browser createSession), so the engine drives ITS browser —
 * a local Chromium (OSS) or the hosted CF browser (cloud). BOTH modes pass it; only the endpoint
 * differs. This is the deploy model's "swap a URL": Ringtail provisions no browser either way. */
const ENGINE_OWNED_BROWSER = "local";

/** How long a navigating `call` waits for the engine's async `human-needed`/`state` SSE event to
 * land before returning — the bridge from the SSE stream to the synchronous `BrowserResult` the
 * driver reads. ponytail: fixed small settle; widen if a slow engine races the tool-return. */
const SETTLE_MS = 200;

/**
 * Adapt an SDK `BrowserSession` to the `BrowserMinter` door `driveBrowserMint` drives. The ENGINE
 * owns detection + password-blinding; we mirror its handoff onto the value-free `BrowserResult` by
 * tracking the SSE `human-needed`/`state` events (the shape LiveView.tsx reads) — no ported probe.
 * Recipe addressing is text/label-based, so `browser_click`/`browser_form_input` resolve a ref via
 * the engine's `find` first. `browser_read_page` reads the fresh key DAEMON-LOCAL. ponytail: a live
 * provider tunes its recipe `extract` path to the SDK's PageSnapshot shape; the mock-driven tests
 * bypass this adapter entirely (they inject a fake BrowserMinter), and the engine — not us — gates
 * what ever leaves.
 */
function sessionMinter(
  session: BrowserSession,
  teardown: () => Promise<void>,
  sinks: LiveViewSinks = {},
): BrowserMinter {
  let paused = false;
  let pendingHuman: { reason: string; instructions?: string } | undefined;
  let ping: (() => void) | undefined;
  // Live-view: pipe the engine's screencast frame/cursor SSE events straight to the daemon sinks
  // (which push them onto the cockpit snapshot over `/events`). Subscribing here starts the SDK's
  // SSE stream; the state/human-needed handoff below reuses that same one connection.
  if (sinks.onFrame)
    session.on("frame", (f) => sinks.onFrame?.({ pngBase64: f.pngBase64, seq: f.seq }));
  if (sinks.onCursor) session.on("cursor", (c) => sinks.onCursor?.({ x: c.x, y: c.y }));
  session.on("human-needed", (h) => {
    pendingHuman = {
      reason: h.reason,
      ...(h.instructions ? { instructions: h.instructions } : {}),
    };
    paused = true;
    ping?.();
  });
  session.on("state", (s) => {
    paused = s.paused;
    if (!s.paused) pendingHuman = undefined;
    ping?.();
  });
  // Wait up to SETTLE_MS for the next handoff/state SSE event (or resolve early when one arrives).
  const settle = (): Promise<void> =>
    new Promise((res) => {
      const t = setTimeout(() => {
        ping = undefined;
        res();
      }, SETTLE_MS);
      ping = () => {
        clearTimeout(t);
        ping = undefined;
        res();
      };
    });
  const withHandoff = (json: Record<string, unknown>): BrowserResult => ({
    json,
    ...(pendingHuman ? { human: pendingHuman } : {}),
    ...(paused ? { paused: true } : {}),
  });
  // Resolve a text/label to an element ref via the engine's find (recipes address by text).
  const refFor = async (query: string, explicit: unknown): Promise<string | undefined> => {
    if (typeof explicit === "string" && explicit) return explicit;
    if (!query) return undefined;
    const snap = await session.find(query);
    return snap.elements[0]?.ref;
  };

  return {
    async call(tool, args = {}): Promise<BrowserResult> {
      switch (tool) {
        case "browser_open": {
          const r = await session.open(String(args.url ?? ""));
          await settle();
          return withHandoff({ ok: !r.isError, url: args.url });
        }
        case "browser_click": {
          const ref = await refFor(String(args.text ?? ""), args.ref);
          if (ref) await session.click({ ref });
          await settle();
          return withHandoff({ ok: Boolean(ref) });
        }
        case "browser_form_input": {
          // NON-secret fields only — driveBrowserMint's isSecretInput refused any password/OTP
          // field before this runs (a defensive belt on top of the engine's own blinding).
          const ref = await refFor(String(args.label ?? ""), args.ref);
          if (ref) await session.formInput(ref, String(args.value ?? ""));
          return { json: { ok: Boolean(ref) } };
        }
        case "browser_read_page": {
          // Read the fresh key DAEMON-LOCAL. ponytail: best-effort — a live provider tunes its
          // recipe extract path to this PageSnapshot; the value never reaches the model regardless.
          const snap = await session.readPage();
          const secret = snap.elements.find((e) => e.value)?.value ?? "";
          return { json: { title: snap.title, url: snap.url, secret, keyId: "" } };
        }
        case "browser_wait_for_human": {
          // Anti-sleep-loop: the engine-side wait returns the instant the human resumes, else times
          // out and driveBrowserMint re-calls. `paused` (SSE-tracked) is the authoritative signal.
          const secs = Math.max(1, Math.ceil(Number(args.timeoutMs ?? 500) / 1000));
          await session.waitForHuman(secs);
          await settle();
          return paused
            ? { json: { resumed: false, timedOut: true }, paused: true }
            : { json: { resumed: true }, paused: false };
        }
        case "browser_screenshot": {
          // MODEL-SUPPRESSION is the ENGINE's job now (it blanks the shot while a wall is up); we
          // relay, and keep a defensive belt: no bytes while paused.
          if (paused) return { json: { png_base64: "" }, paused: true };
          const r = await session.screenshot();
          return { json: { png_base64: r.image ?? "" } };
        }
        default:
          return { json: { ok: true } };
      }
    },
    close: teardown,
  };
}

/**
 * Build a `BrowserMinter` by CONSUMING a running Envoyage engine via the SDK. Dispatches by
 * `RINGTAIL_BROWSER_MODE`, differing ONLY by endpoint (the deploy model's "swap a URL"):
 *   • `cloud` (paid) — the HOSTED Envoyage endpoint (`RINGTAIL_ENVOYAGE_URL` + `_TOKEN`, required).
 *     The hosted service owns the CF browser; Ringtail provisions none.
 *   • `local` (OSS)  — a local `envoyage serve`: point at `RINGTAIL_ENVOYAGE_URL` when set, else
 *     spawn the `envoyage` bin via the SDK's `launch()` (which owns a local Chromium).
 *   • `off`          — throws the "browser-mint is off" guard (a fresh install has no browser).
 * Both live modes pass the `ENGINE_OWNED_BROWSER` sentinel → the engine owns the browser.
 */
export async function connectBrowserMinter(
  env: Env = getEnv(),
  sinks: LiveViewSinks = {},
): Promise<BrowserMinter> {
  if (env.RINGTAIL_BROWSER_MODE === "off") {
    throw new Error("browser-mint is off — set RINGTAIL_BROWSER_MODE=local|cloud to enable it");
  }
  const token = env.RINGTAIL_ENVOYAGE_TOKEN;
  if (env.RINGTAIL_BROWSER_MODE === "cloud") {
    if (!env.RINGTAIL_ENVOYAGE_URL) {
      throw new Error(
        "cloud browser-mint needs RINGTAIL_ENVOYAGE_URL (the hosted Envoyage endpoint)",
      );
    }
    const session = createSession({
      endpoint: env.RINGTAIL_ENVOYAGE_URL,
      cdpUrl: ENGINE_OWNED_BROWSER,
      ...(token ? { token } : {}),
    });
    return sessionMinter(session, () => session.close(), sinks);
  }
  // local: an explicit URL points at an already-running engine; no URL → spawn one via the SDK.
  if (env.RINGTAIL_ENVOYAGE_URL) {
    const session = createSession({
      endpoint: env.RINGTAIL_ENVOYAGE_URL,
      cdpUrl: ENGINE_OWNED_BROWSER,
      ...(token ? { token } : {}),
    });
    return sessionMinter(session, () => session.close(), sinks);
  }
  const local = await launch({
    ...(process.env.RINGTAIL_ENVOYAGE_BIN ? { bin: process.env.RINGTAIL_ENVOYAGE_BIN } : {}),
    ...(token ? { token } : {}),
  });
  return sessionMinter(local.session, () => local.stop(), sinks);
}

// ── the browser-recipe registry + the handoff state machine ──────────────────────────────────

/**
 * One scripted browser action in a mint recipe — a single `browser_*` tool call. A recipe is a
 * FIXED step list (NOT an LLM): deterministic, unit-testable, and STRUCTURALLY unable to type a
 * password — there is simply no password step. The human types the password/OTP in the live view
 * during handoff; the recipe only drives to the wall and, once the human clears it, on to the key.
 */
export interface BrowserStep {
  /** e.g. `browser_open` · `browser_click` · `browser_form_input` · `browser_read_page`. */
  tool: string;
  args?: Record<string, unknown>;
  /** Read the minted value (+ optional key id) back from this step's result — DAEMON-LOCAL. */
  extract?: { path: string; idPath?: string };
}

export interface BrowserRecipe {
  /** Provider id (also the vault/audit key). Distinct from a @ringtail/recipes id — a browser
   *  recipe targets a DASHBOARD-ONLY provider with no mint-API. */
  provider: string;
  /** Which env-var NAMES this drives (e.g. `OPENAI_` → openai). Names only, never a value. */
  varPrefix: RegExp;
  /** The console page the mint starts on. */
  loginUrl: string;
  /** The fixed mint choreography. NEVER includes typing a password/OTP (enforced below). */
  steps: BrowserStep[];
}

/**
 * The browser-recipe registry. Increment 1 ships ONE real provider end-to-end (OpenAI — a
 * dashboard-only API key with no public mint-API, created behind a login wall). More providers
 * are DATA, not code: add a row. `ponytail: a static map, not a plugin system — a provider is a
 * login URL + a step list.`
 */
export const browserRecipes: BrowserRecipe[] = [
  {
    provider: "openai",
    varPrefix: /^OPENAI/,
    loginUrl: "https://platform.openai.com/api-keys",
    steps: [
      // Open the keys page. Not signed in → Envoyage auto-detects the login/password wall on the
      // NEXT navigating call and hands off to the human (it blanks the screenshot — the model is
      // blind to the password field the human is about to type).
      { tool: "browser_open", args: { url: "https://platform.openai.com/api-keys" } },
      { tool: "browser_click", args: { text: "Create new secret key" } },
      { tool: "browser_form_input", args: { label: "Name", value: "ringtail" } },
      { tool: "browser_click", args: { text: "Create secret key" } },
      // Read the freshly-minted key off the modal — captured DAEMON-LOCAL, never to the agent.
      { tool: "browser_read_page", extract: { path: "secret", idPath: "keyId" } },
    ],
  },
];

/**
 * A short Rocco-voice narration for one browser step — the backend-agnostic source of the cockpit's
 * SSE action bubbles (Increment 2). VALUE-FREE by construction: it names the TOOL + a non-secret
 * label (the click text, the field NAME, the url host) — never a minted value. `browser_read_page`
 * reads the fresh key DAEMON-LOCAL, so its line is deliberately value-free ("reading the new key…").
 */
export function stepLabel(step: BrowserStep): string {
  const a = step.args ?? {};
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  switch (step.tool) {
    case "browser_open": {
      const url = str(a.url);
      let host = url;
      try {
        host = new URL(url).host;
      } catch {
        /* keep the raw string */
      }
      return `opening ${host || "the dashboard"}…`;
    }
    case "browser_click":
      return `clicking “${str(a.text) || "the button"}”…`;
    case "browser_form_input":
      return `typing the ${str(a.label) || "field"}…`;
    case "browser_read_page":
      return "reading the new key…";
    default:
      return `${step.tool}…`;
  }
}

/** The browser recipe that drives `varName`, or undefined. Names only. */
export function browserRecipeFor(varName: string): BrowserRecipe | undefined {
  const up = varName.toUpperCase();
  return browserRecipes.find((r) => r.varPrefix.test(up));
}

/** The browser-mint provider id for `varName`, or undefined (used by the planner's classifier). */
export function browserProviderFor(varName: string): string | undefined {
  return browserRecipeFor(varName)?.provider;
}

/** The handoff states (a thin wrapper over Envoyage's `paused` flag) — surfaced to the cockpit
 * so it can render the "your turn" moment (Increment 2). */
export type HandoffState = "DRIVING" | "HUMAN_NEEDED" | "PAUSED" | "RESUMED";

/** Poll cap for the anti-sleep-loop wait (mirrors `browser_wait_for_human`): we re-CALL on
 * timeout rather than sleeping, so an arbitrarily long human pause never blocks the daemon. */
const MAX_HUMAN_WAITS = 1200; // 1200 × 500ms ≈ 10 min ceiling

/** A field the machine must NEVER type — the human types these in the live view. Structural
 * mirror of Envoyage's password-blindness: even if a recipe tried, `driveBrowserMint` refuses. */
const SECRET_FIELD = /pass(word)?|otp|2fa|totp|mfa|verif|\bpin\b|secret/i;

/** Is this a `form_input` into a password/OTP/secret field? (the invariant guard). */
export function isSecretInput(step: BrowserStep): boolean {
  if (step.tool !== "browser_form_input") return false;
  const a = step.args ?? {};
  // Args are agent/recipe-authored `unknown` — coerce only real strings into the haystack.
  const hay = [a.label, a.name, a.field, a.selector, a.placeholder]
    .filter((x): x is string => typeof x === "string")
    .join(" ");
  return SECRET_FIELD.test(hay);
}

/**
 * Poll for the human to clear a wall — the ANTI-SLEEP-LOOP pattern (copy of Envoyage's):
 * `browser_wait_for_human` returns the instant the human hits ▶ Continue, else times out and we
 * RE-CALL. While paused the ONLY tool this calls is `browser_wait_for_human` — structural
 * enforcement that the machine can't act while the human owns the screen. Returns whether resumed.
 */
async function awaitHuman(
  client: BrowserMinter,
  onState?: (s: HandoffState, ctx?: { reason?: string }) => void,
): Promise<boolean> {
  onState?.("PAUSED");
  for (let i = 0; i < MAX_HUMAN_WAITS; i++) {
    const res = await client.call("browser_wait_for_human", { timeoutMs: 500 });
    if (res.json.resumed === true || res.paused === false) return true;
  }
  return false;
}

/**
 * Drive one browser mint recipe to a minted value, gating on the handoff state machine
 * (DRIVING → HUMAN_NEEDED → PAUSED → RESUMED → DRIVING). Returns the value + optional keyId
 * (DAEMON-LOCAL — the caller files it and returns names only) or a value-free error. `onState`
 * lets the daemon narrate the handoff to the cockpit (Increment 2). The trust rule is enforced
 * STRUCTURALLY: a secret-field input aborts the whole mint, and while paused only
 * `browser_wait_for_human` runs — the machine never types the password.
 */
export async function driveBrowserMint(
  client: BrowserMinter,
  recipe: BrowserRecipe,
  onState?: (s: HandoffState, ctx?: { reason?: string }) => void,
  /** Rocco-voice narration for the cockpit's SSE action bubbles (Increment 2). `handoff` marks the
   * orange "your turn" bubble. VALUE-FREE — see `stepLabel`. */
  onNarrate?: (text: string, handoff?: boolean) => void,
): Promise<{ value: string; keyId?: string } | { error: string }> {
  let value: string | undefined;
  let keyId: string | undefined;
  for (const step of recipe.steps) {
    if (isSecretInput(step)) {
      return {
        error:
          "browser recipe must never type a password/OTP — the human does that in the live view",
      };
    }
    onState?.("DRIVING");
    onNarrate?.(stepLabel(step));
    let res = await client.call(step.tool, step.args);
    // Envoyage auto-detect (password/CAPTCHA/Cloudflare/OAuth) OR a proactive request → handoff.
    if (res.human || res.paused) {
      const reason = res.human?.reason;
      onState?.("HUMAN_NEEDED", reason ? { reason } : undefined);
      onNarrate?.(
        `your turn — ${res.human?.instructions ?? "clear the login in the panel, then hit ▶ Continue"}`,
        true,
      );
      const resumed = await awaitHuman(client, onState);
      if (!resumed) return { error: "browser handoff timed out waiting for the human" };
      onState?.("RESUMED");
      onNarrate?.("got it — taking over from here.");
      // Re-run the step that hit the wall now that the human cleared it.
      res = await client.call(step.tool, step.args);
      if (res.human || res.paused) return { error: "still blocked after handoff — aborting mint" };
    }
    if (step.extract) {
      const v = pluck(res.json, step.extract.path);
      if (v !== undefined && v !== null && v !== "") value = String(v);
      if (step.extract.idPath) {
        const id = pluck(res.json, step.extract.idPath);
        if (id !== undefined && id !== null && id !== "") keyId = String(id);
      }
    }
  }
  if (!value) return { error: "browser mint drove to the end but produced no value" };
  return { value, ...(keyId ? { keyId } : {}) };
}
