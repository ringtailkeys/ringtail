/**
 * ENVOYAGE — browser-mint over HTTP-streaming MCP (the no-mint-API path). When a provider has
 * no management API to mint a token, Ringtail drives its web CONSOLE with a real browser
 * (Envoyage) to produce the credential — the value lands through the SAME validate + sink close
 * an API mint uses (see mint.ts::executeBrowserMint), so THE GUARANTEE (the value never leaves
 * the daemon) holds for free.
 *
 * Transport is a near-verbatim clone of ai-worker's `connectDaemon`: the SAME
 * StreamableHTTPClientTransport + bearer pattern Ringtail already speaks to its own daemon. The
 * browser BACKEND (local Chromium vs a Cloudflare browser) is NOT a client concern — it's decided
 * by a serve flag on the Envoyage process (`--cdp-url` present or not); the client only knows a
 * URL + bearer. `ponytail: no backend interface with two impls — the difference is a process flag,
 * not a class hierarchy.`
 */
import { type ChildProcess, spawn } from "node:child_process";
import { getEnv, type Env } from "@ringtail/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * The value-free result of one browser tool call, as the DAEMON-LOCAL driver sees it. `json` is
 * the parsed tool payload; `human`/`paused` mirror Envoyage's NATIVE handoff detection (it
 * blanks the screenshot + sets `paused` on a password/CAPTCHA/OAuth wall — the model gets text
 * only, structurally blind to the secret the human is about to type).
 */
export interface BrowserResult {
  json: Record<string, unknown>;
  /** Envoyage flagged a human wall on this step (password/CAPTCHA/Cloudflare/OAuth, or a
   *  proactive `browser_request_human`). Highest-priority auto-detect is the password field. */
  human?: { reason: string; instructions?: string };
  /** Envoyage's `paused` flag — true from a detected wall until the human hits ▶ Continue. */
  paused?: boolean;
}

/**
 * The BACKEND-AGNOSTIC browser-mint surface — the subset of Envoyage's 18 `browser_*` tools the
 * mint driver (`driveBrowserMint`) uses, behind ONE `call` door. TWO backends implement it:
 *   • LOCAL (OSS)  — `connectEnvoyage` (this file): a thin wrapper over the same
 *     StreamableHTTPClientTransport `connectDaemon` speaks; Envoyage owns the browser + native
 *     (Rust) password-blinding.
 *   • CLOUD (paid) — `connectCloudBrowser` (cloud-browser.ts): drives a Cloudflare browser over
 *     CDP DIRECTLY, no Envoyage service; the password-blinding boundary is ported into TS there.
 * `connectBrowserMinter(env)` dispatches by `RINGTAIL_BROWSER_MODE`. Renamed from `EnvoyageClient`
 * because the cloud backend has no Envoyage — the old name was a lie. Tests drive a mock that
 * implements this interface (a Map of tool-name → scripted fn), so the loop logic is proven with
 * NO real browser.
 */
export interface BrowserMinter {
  call(tool: string, args?: Record<string, unknown>): Promise<BrowserResult>;
  close(): Promise<void>;
}

/** Walk a dot-path into a parsed JSON value; undefined if any hop is missing. */
function pluck(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** Parse an MCP `callTool` result (one text-content JSON block, same shape the daemon emits)
 * into the value-free `BrowserResult` the driver reasons over. */
function parseBrowserResult(res: unknown): BrowserResult {
  const content = (res as { content?: Array<{ text?: string }> }).content ?? [];
  const text = content.map((c) => c.text ?? "").join("");
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { text };
  }
  const human = json.human_request as BrowserResult["human"] | undefined;
  return {
    json,
    ...(human ? { human } : {}),
    ...(typeof json.paused === "boolean" ? { paused: json.paused } : {}),
  };
}

/** Poll one URL until it answers (any HTTP status) or the cap trips — poll-not-sleep, used to
 * wait for a freshly-spawned Envoyage's /mcp to come up. `ponytail: fixed small cap; widen if a
 * cold Chromium launch is slower than this on the target box.` */
async function waitForPort(url: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url, { method: "GET" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Envoyage did not come up at ${url}`);
}

/** Resolve the Envoyage MCP endpoint for this env, spawning a local Envoyage when needed. */
async function resolveEndpoint(env: Env): Promise<{ url: string; child?: ChildProcess }> {
  if (env.RINGTAIL_ENVOYAGE_URL) return { url: env.RINGTAIL_ENVOYAGE_URL };
  if (env.RINGTAIL_BROWSER_MODE === "cloud") {
    throw new Error("cloud browser-mint needs RINGTAIL_ENVOYAGE_URL (the hosted engine's /mcp)");
  }
  // local + no URL → lazily spawn `envoyage serve` and point at its loopback /mcp. `--ws-port`
  // is the live-view frame stream (Increment 2's cockpit). Binary path is overridable so a
  // from-source build points at target/debug/envoyage; default `envoyage` is on PATH.
  // ponytail: fixed loopback ports; make them dynamic once two mints must run at once.
  const bin = process.env.RINGTAIL_ENVOYAGE_BIN ?? "envoyage";
  const httpPort = process.env.RINGTAIL_ENVOYAGE_HTTP_PORT ?? "8799";
  const wsPort = process.env.RINGTAIL_ENVOYAGE_WS_PORT ?? "8800";
  const child = spawn(bin, ["serve", "--http-port", httpPort, "--ws-port", wsPort], {
    stdio: "ignore",
    detached: false,
  });
  const url = `http://127.0.0.1:${httpPort}/mcp`;
  await waitForPort(url);
  return { url, child };
}

/**
 * Connect to Envoyage as an MCP client over HTTP-streaming — the clone of `connectDaemon`.
 * Backend (local Chromium vs CF browser) is decided by `getEnv()`, NOT a constructor arg: one
 * door, no DI ceremony. Throws when browser-mode is off (a fresh install has no browser).
 */
export async function connectEnvoyage(env: Env = getEnv()): Promise<BrowserMinter> {
  if (env.RINGTAIL_BROWSER_MODE === "off") {
    throw new Error("browser-mint is off — set RINGTAIL_BROWSER_MODE=local|cloud to enable it");
  }
  const { url, child } = await resolveEndpoint(env);
  const transportOpts = env.RINGTAIL_ENVOYAGE_TOKEN
    ? { requestInit: { headers: { Authorization: `Bearer ${env.RINGTAIL_ENVOYAGE_TOKEN}` } } }
    : {};
  const transport = new StreamableHTTPClientTransport(new URL(url), transportOpts);
  const client = new Client({ name: "ringtail-envoyage", version: "0.0.0" });
  await client.connect(transport);
  return {
    call: async (tool, args = {}) =>
      parseBrowserResult(await client.callTool({ name: tool, arguments: args })),
    close: async () => {
      await client.close();
      child?.kill(); // reap a spawned local Envoyage; a shared hosted engine has no child
    },
  };
}

/**
 * Dispatch to the right `BrowserMinter` backend by `RINGTAIL_BROWSER_MODE`: `cloud` → the CF-CDP
 * direct driver (cloud-browser.ts, NO Envoyage service); `local`/`off` → local Envoyage. This is
 * `executeBrowserMint`'s default `connect`, so the whole mint chain is backend-agnostic. `off` still
 * reaches connectEnvoyage, which throws the "browser-mint is off" guard — one place owns that error.
 * ponytail: import the cloud backend lazily so a pure-local build never loads its CDP code path.
 */
export async function connectBrowserMinter(env: Env = getEnv()): Promise<BrowserMinter> {
  if (env.RINGTAIL_BROWSER_MODE === "cloud") {
    const { connectCloudBrowser } = await import("./cloud-browser");
    return connectCloudBrowser(env);
  }
  return connectEnvoyage(env);
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
    let res = await client.call(step.tool, step.args);
    // Envoyage auto-detect (password/CAPTCHA/Cloudflare/OAuth) OR a proactive request → handoff.
    if (res.human || res.paused) {
      onState?.("HUMAN_NEEDED", res.human?.reason ? { reason: res.human.reason } : undefined);
      const resumed = await awaitHuman(client, onState);
      if (!resumed) return { error: "browser handoff timed out waiting for the human" };
      onState?.("RESUMED");
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
