import { existsSync, readFileSync } from "node:fs";
import { getEnv } from "@ringtail/config";
import { RECIPES, type Recipe, type ValidateResult } from "@ringtail/recipes";
import { syncCredential, type Environment } from "@ringtail/sinks";
import { putCredential, readStore } from "@ringtail/store";

/**
 * @ringtail/core — the engine. The whole product is one linear state machine:
 *
 *   idle → acquire → validateScopes → provision → sync → done   (or → error)
 *
 * Every provider walks the same path; recipes (@ringtail/recipes) supply the
 * provider-specific bits, sinks (@ringtail/sinks) land the keys, store
 * (@ringtail/store) persists them. This file imports all four libs — proving
 * the boundary law: core (a lib) depends only DOWN on other libs, never up.
 */
export type ProvisionState =
  | "idle"
  | "acquire"
  | "validateScopes"
  | "provision"
  | "sync"
  | "done"
  | "error";

export interface Provisioner {
  readonly state: ProvisionState;
  acquire(recipeId: string): Promise<void>;
  validateScopes(): Promise<ValidateResult>;
  provision(): Promise<Record<string, string>>;
  sync(env: Environment): Promise<void>;
}

/** The default environment to sync into, from validated config. */
export function defaultEnvironment(): Environment {
  return getEnv().INFISICAL_ENVIRONMENT;
}

/** Per-cell state in the providers × envs connection grid the dashboard renders. */
export type ConnStatus = "connected" | "missing" | "needs-consent";

export interface ProviderStatus {
  id: string;
  /** Env-var names this provider owns. */
  envVars: string[];
  /** Status per environment. */
  envs: Record<Environment, ConnStatus>;
}

const ENVIRONMENTS: Environment[] = ["dev", "staging", "prod"];

/**
 * The connection map the daemon serves at /api/status: every known recipe ×
 * {dev,staging,prod}. Real-shaped, not hardcoded — provider list comes from
 * RECIPES, per-cell status from what's actually landed in the root store:
 *   all env-vars present → "connected" · some → "missing" · none → "needs-consent".
 * On a fresh machine the store is empty, so every cell is honestly "needs-consent".
 *
 * ponytail: the store is machine-global (not yet per-env), so the same status
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
 * Read `.env.example` (the manifest / shopping list) into the plan: every
 * credential the project declares, grouped by section, each flagged present or
 * missing. `present` reflects the LIVE env (default process.env) — NOT the RHS
 * written in the example, which holds names only. Missing file → empty plan.
 * Pure + path-injected so the CLI/daemon own where the file lives, not core.
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
 * A runnable end-to-end walkthrough over a fake provider — real state
 * transitions, mock provider grant. Swap for LiveProvisioner (official APIs)
 * later; the Provisioner contract stays identical.
 */
export class MockProvisioner implements Provisioner {
  #state: ProvisionState = "idle";
  #recipe: Recipe | undefined;
  #values: Record<string, string> = {};

  get state(): ProvisionState {
    return this.#state;
  }

  async acquire(recipeId: string): Promise<void> {
    this.#state = "acquire";
    const recipe = RECIPES[recipeId];
    if (!recipe) {
      this.#state = "error";
      throw new Error(`unknown recipe: ${recipeId}`);
    }
    this.#recipe = recipe;
    // Fake the provider grant: one plausible value per required env var.
    this.#values = Object.fromEntries(recipe.envVars.map((k) => [k, `mock-${k.toLowerCase()}`]));
  }

  async validateScopes(): Promise<ValidateResult> {
    this.#state = "validateScopes";
    if (!this.#recipe) throw new Error("call acquire() first");
    const result = await this.#recipe.validate(this.#values);
    if (!result.ok) this.#state = "error";
    return result;
  }

  async provision(): Promise<Record<string, string>> {
    this.#state = "provision";
    return this.#values;
  }

  async sync(env: Environment): Promise<void> {
    this.#state = "sync";
    const provider = this.#recipe?.id ?? "mock";
    for (const [key, value] of Object.entries(this.#values)) {
      await syncCredential(key, value, { env });
      putCredential(key, { value, provider, updatedAt: new Date().toISOString() });
    }
    this.#state = "done";
  }
}

/**
 * Runnable self-check (ponytail: the one check the state machine needs).
 * Walks acquire → validate → provision without touching disk (skips sync).
 * Run: `bun -e 'import("@ringtail/core").then((m) => m.demo())'`
 */
export async function demo(): Promise<void> {
  const p = new MockProvisioner();
  await p.acquire("cloudflare");
  const v = await p.validateScopes();
  const values = await p.provision();
  if (!v.ok) throw new Error("demo: expected scope validation to pass");
  if (Object.keys(values).length !== 2) throw new Error("demo: expected 2 provisioned values");
  if (p.state !== "provision") throw new Error(`demo: unexpected state ${p.state}`);
  // readStore is import-proof; don't assert (may be empty on a fresh machine).
  void readStore;
  console.log("✓ core demo: cloudflare walked acquire→validate→provision");
}
