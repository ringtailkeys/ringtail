import { existsSync, readFileSync } from "node:fs";
import { getEnv } from "@ringtail/config";
import { getRecipe, RECIPES, type Recipe, type ValidateResult } from "@ringtail/recipes";
import { syncCredential, type Environment } from "@ringtail/sinks";
import { putCredential, readStore, resolveRootCreds } from "@ringtail/store";
import { GRID_ENVS, type GridEnv, type GridRow } from "./wizard";

export type { Environment } from "@ringtail/sinks";

// The generative-UI contract (Wizard/Step/Action + the env axis) — the surface
// the daemon validates and the dashboard renders. Re-exported through the public door.
export * from "./wizard";
// Typed cross-tool action executors (layer 2) — domain→CF + the dispatch registry.
export * from "./actions";
// The offline mock provider — dev daemon + the P2 driver reach it through core's door.
export { startMockProvider, type MockProvider } from "./mock-provider";

/**
 * @ringtail/core — the engine. Every provider walks ONE credential lifecycle:
 *
 *   missing → needs-consent → validating → (validated | wrong-scope)
 *                                        → provisioning → synced
 *
 * validate runs AFTER mint (probe the token you actually got, not the one you
 * asked for). recipes (@ringtail/recipes) supply the provider bits, sinks land
 * the keys, store persists them. core imports all three libs — proving the
 * boundary law: core (a lib) depends only DOWN on other libs, never up.
 *
 * NEVER emit secret VALUES. Status, reports, and JSON carry key NAMES + state.
 */

/**
 * The credential lifecycle vocabulary — matches @ringtail/ui's CredentialStatus
 * exactly (the cockpit renders these). Redeclared here (not imported) so core
 * stays free of the React UI lib; the two string unions are kept in lockstep.
 */
export type CredentialStatus =
  | "missing"
  | "needs-consent"
  | "validating"
  | "validated"
  | "wrong-scope"
  | "provisioning"
  | "synced"
  // Layer 4 (recovery): a provision/sync action failed (API error, rate-limit,
  // conflict). First-class, rendered state — carries a plain-language reason, never
  // a secret value. Distinct from `wrong-scope` (caught at validate, before any call).
  | "failed";

/** The default environment to sync into, from validated config. */
export function defaultEnvironment(): Environment {
  return getEnv().INFISICAL_ENVIRONMENT;
}

const ENVIRONMENTS: Environment[] = ["dev", "staging", "prod"];

// ── connection grid (dashboard /api/status) ──────────────────────────────────

/** Per-cell state in the providers × envs grid the dashboard renders. A coarse
 * 3-state view (the cockpit's finer CredentialStatus is the per-provisioning state). */
export type ConnStatus = "connected" | "missing" | "needs-consent";

export interface ProviderStatus {
  id: string;
  /** Env-var names this provider owns. */
  envVars: string[];
  /** Status per environment. */
  envs: Record<Environment, ConnStatus>;
}

/**
 * The connection map the daemon serves at /api/status: every real recipe ×
 * {dev,staging,prod}. Real-shaped, not hardcoded — provider list from RECIPES,
 * per-cell status from what's landed in the root store:
 *   all env-vars present → "connected" · some → "missing" · none → "needs-consent".
 * Fresh machine → empty store → every cell honestly "needs-consent".
 *
 * ponytail: the store is machine-global (not per-env yet), so the same status
 * mirrors across all three envs. Split per-env once the Infisical sink tracks
 * which environment each secret landed in.
 */
export function connectionMap(): ProviderStatus[] {
  const store = readStore();
  return Object.values(RECIPES).map((recipe) => {
    const present = recipe.envVars.filter((k) => store.credentials[k]).length;
    const status: ConnStatus =
      present === recipe.envVars.length && present > 0
        ? "connected"
        : present === 0
          ? "needs-consent"
          : "missing";
    const envs = Object.fromEntries(ENVIRONMENTS.map((e) => [e, status])) as Record<
      Environment,
      ConnStatus
    >;
    return { id: recipe.id, envVars: recipe.envVars, envs };
  });
}

/**
 * Seed the live cockpit grid: every real recipe × {local,dev,staging,prod}, all
 * cells "missing" (a fresh machine — nothing raided yet). The daemon holds this as
 * mutable state; MCP tool calls flip cells as the agent drives. Provider list +
 * env-var names come from RECIPES (single source of truth), never hardcoded.
 */
export function gridSeed(): GridRow[] {
  return Object.values(RECIPES).map((recipe) => ({
    provider: recipe.id,
    envVars: recipe.envVars,
    envs: Object.fromEntries(GRID_ENVS.map((e) => [e, "missing" as CredentialStatus])) as Record<
      GridEnv,
      CredentialStatus
    >,
  }));
}

// ── the plan (read .env.example → gap per env) ───────────────────────────────

/** One credential on the plan — a var from the `.env.example` manifest. */
export interface PlanEntry {
  /** Env-var name (e.g. CLOUDFLARE_API_TOKEN). */
  key: string;
  /** The `# ── Section ──` header it lives under (e.g. "Cloudflare"). */
  section: string;
  /** Already satisfied in the live env — provisioning can skip it. */
  present: boolean;
}

const SECTION = /^#\s*─+\s*([^─]+?)\s*─+\s*$/;
const ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/**
 * Read `.env.example` (the manifest) into the plan: every credential the project
 * declares, grouped by section, each flagged present or missing against the LIVE
 * env (default process.env) — NOT the RHS in the example, which holds names only.
 * Missing file → empty plan. Pure + path-injected.
 */
export function readPlan(
  examplePath: string,
  env: Record<string, string | undefined> = process.env,
): PlanEntry[] {
  if (!existsSync(examplePath)) return [];
  const entries: PlanEntry[] = [];
  let section = "";
  for (const line of readFileSync(examplePath, "utf8").split("\n")) {
    const sec = SECTION.exec(line);
    if (sec?.[1]) {
      section = sec[1];
      continue;
    }
    const key = ASSIGN.exec(line)?.[1];
    if (key) entries.push({ key, section, present: Boolean(env[key]?.trim()) });
  }
  return entries;
}

/**
 * The gap per environment: the manifest read once, then projected onto each of
 * {dev,staging,prod}. The store is machine-global today, so the gap is the same
 * across envs — but the shape is honest to the per-env model the sinks target.
 */
export function planByEnv(
  examplePath: string,
  env: Record<string, string | undefined> = process.env,
): Record<Environment, PlanEntry[]> {
  const entries = readPlan(examplePath, env);
  return Object.fromEntries(ENVIRONMENTS.map((e) => [e, entries])) as Record<
    Environment,
    PlanEntry[]
  >;
}

// ── the state machine ────────────────────────────────────────────────────────

/**
 * Drives one recipe through the credential lifecycle. Holds the minted secret
 * VALUES privately (#values) — callers only ever see key names + status. Works
 * against any recipe with mint/validate/autoProvision (the mock provider today,
 * real auto providers later); the contract is identical.
 */
export class Provisioner {
  readonly #recipe: Recipe;
  #values: Record<string, string> = {};
  status: CredentialStatus = "missing";
  readonly trail: CredentialStatus[] = [];

  constructor(recipeId: string) {
    const recipe = getRecipe(recipeId);
    if (!recipe) throw new Error(`unknown recipe: ${recipeId}`);
    this.#recipe = recipe;
  }

  get recipeId(): string {
    return this.#recipe.id;
  }

  private to(status: CredentialStatus): void {
    this.status = status;
    this.trail.push(status);
  }

  /** Consent granted — we now hold the recipe and may raid its token endpoint. */
  consent(): void {
    this.to("needs-consent");
  }

  /** Mint a scoped token (OAuth-style), OR — for a guided recipe with no mint (e.g.
   * real cloudflare) — load the root creds the user already pasted (submitStep →
   * @ringtail/store). Either way `#values` holds the creds validate/provision need:
   * the "swap endpoints" seam that lets a real recipe drive identically to the mock.
   * Moves to `validating` (validate is next). */
  async mint(): Promise<void> {
    if (this.#recipe.mint) {
      this.#values = { ...this.#values, ...(await this.#recipe.mint()) };
    } else if (this.#recipe.rootCredKeys?.length) {
      const stored = resolveRootCreds(this.#recipe.rootCredKeys);
      if (stored) this.#values = { ...this.#values, ...stored };
    }
    this.to("validating");
  }

  /** Validate-AFTER-mint: probe the token. Sets `validated` or `wrong-scope`. */
  async validateScopes(): Promise<ValidateResult> {
    if (!this.#recipe.validate) {
      this.to("validated");
      return { ok: true, scopes: [], missing: [] };
    }
    const result = await this.#recipe.validate(this.#values);
    this.to(result.ok ? "validated" : "wrong-scope");
    return result;
  }

  /** Create the cloud resource. Returns the env-var NAMES it produced (no values).
   * A provider failure (rate-limit/conflict/API error) → `failed` state, then rethrow
   * so the caller can build a recovery report. Recovery is first-class, not an exception. */
  async provision(repoName: string): Promise<string[]> {
    this.to("provisioning");
    if (this.#recipe.autoProvision) {
      try {
        this.#values = await this.#recipe.autoProvision(this.#values, {
          repoName,
          log: () => undefined, // ponytail: swallow provider progress; wire to a stream when the UI wants it
        });
      } catch (err) {
        this.to("failed");
        throw err;
      }
    }
    return Object.keys(this.#values);
  }

  /** Fan every provisioned value to the sinks for `env`, persist to the store, → synced. */
  async sync(env: Environment, envLocalPath?: string): Promise<{ wroteLocal: boolean }> {
    let wroteLocal = false;
    for (const [key, value] of Object.entries(this.#values)) {
      const r = await syncCredential(key, value, { env, envLocalPath });
      wroteLocal = wroteLocal || r.wroteLocal;
      putCredential(key, { value, provider: this.#recipe.id, updatedAt: new Date().toISOString() });
    }
    this.to("synced");
    return { wroteLocal };
  }
}

/** A provisioning outcome — names + status only, NEVER secret values. */
export interface ProvisionReport {
  recipe: string;
  env: Environment;
  status: CredentialStatus;
  trail: CredentialStatus[];
  scopes: string[];
  missing: string[];
  /** Env-var NAMES that were synced. */
  keys: string[];
  /** Whether a local .env.local was written (dev only). */
  wroteLocal: boolean;
  /** Plain-language cause when status is `wrong-scope` or `failed` — the recovery
   * hook the agent re-plans from. Names/reasons only, NEVER a secret value. */
  reason?: string;
}

/**
 * Run one recipe end-to-end for one environment: consent → mint → validate →
 * provision → sync. A wrong-scope token is caught at validate and short-circuits
 * BEFORE provisioning (never sync an under-scoped credential). Returns a report
 * with key names + the status trail; no secret values ever leave this function.
 */
export async function provisionCredential(
  recipeId: string,
  opts: { env: Environment; repoName?: string; envLocalPath?: string },
): Promise<ProvisionReport> {
  const p = new Provisioner(recipeId);
  p.consent();
  await p.mint();
  const v = await p.validateScopes();

  const baseReport: Omit<ProvisionReport, "keys" | "wroteLocal"> = {
    recipe: recipeId,
    env: opts.env,
    status: p.status,
    trail: p.trail,
    scopes: v.scopes ?? [],
    missing: v.missing ?? [],
  };

  if (!v.ok) {
    // wrong-scope: flagged, not provisioned, not synced. The reason carries the
    // exact missing scope(s) so the agent can author a re-consent recovery wizard.
    return { ...baseReport, reason: v.detail, keys: [], wroteLocal: false };
  }

  try {
    const keys = await p.provision(opts.repoName ?? "ringtail");
    const { wroteLocal } = await p.sync(opts.env, opts.envLocalPath);
    return { ...baseReport, status: p.status, trail: p.trail, keys, wroteLocal };
  } catch (err) {
    // failed action (rate-limit/conflict/API error) — caught, not thrown at the UI.
    // The reason routes the agent to a retry/alternative. No secret value ever here.
    return {
      ...baseReport,
      status: "failed",
      trail: p.trail,
      reason: (err as Error).message,
      keys: [],
      wroteLocal: false,
    };
  }
}

/**
 * Runnable self-check (ponytail: the one check the engine needs, no network).
 * Confirms the manifest→plan projection and the real recipe registry are wired.
 * Run: `bun -e 'import("@ringtail/core").then((m) => m.demo())'`
 */
export function demo(): void {
  const providers = connectionMap();
  if (providers.length !== Object.keys(RECIPES).length) {
    throw new Error("demo: connectionMap should list every real recipe");
  }
  if (!providers.every((p) => ENVIRONMENTS.every((e) => p.envs[e] !== undefined))) {
    throw new Error("demo: every provider must carry a status per environment");
  }
  console.log(`✓ core demo: ${providers.length} providers × ${ENVIRONMENTS.length} envs wired`);
}
