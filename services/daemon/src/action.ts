import {
  ACTION_EXECUTORS,
  provisionCredential,
  type ActionResult,
  type CredentialStatus,
  type Environment,
} from "@ringtail/core";
import type { DaemonStore } from "./state";

/**
 * The daemon's EXECUTE side (architecture.md §"Orchestrate vs execute"). The agent
 * TRIGGERS (executeStep / executeAction over MCP, or a human "approve" via
 * POST /api/action); the daemon EXECUTES with the stored root creds and returns
 * STATUS, never values. Shared by the MCP tools AND the browser approve route so
 * every execution path routes through ONE set of gates:
 *   1. prerequisites — an action whose required providers aren't connected is
 *      BLOCKED, not run (a rendered recovery state, never a dead end).
 *   2. hard-confirm — a `destructive` action (NS swap, delete) NEVER one-clicks;
 *      it refuses to run until `confirmed`.
 *   3. dispatch — a known typed executor (domain→CF), else the provisioning loop.
 */

const DEPLOYED_ENVS: Environment[] = ["dev", "staging", "prod"];
/** A provider counts as "connected" once any env cell reached these states. */
const CONNECTED: CredentialStatus[] = ["validated", "synced"];

export type EngineFailure = {
  env: string;
  status: "wrong-scope" | "failed";
  reason?: string;
  missing: string[];
};

export interface EngineOpts {
  repoName: string;
  envLocalPath?: string;
}

/**
 * Drive the mock engine across the deployed envs; flip grid cells as it goes.
 * dev's .env.local write also backs the `local` column (local → .env.local).
 * Short-circuits on the first wrong-scope/failed env → a typed failure the agent
 * re-plans from (Layer 4). RINGTAIL_MOCK_RECIPE picks which fake recipe this run
 * exercises (mock · mock-badscope · mock-failprovision) — the offline recovery seam.
 */
export async function runEngine(
  store: DaemonStore,
  provider: string,
  opts: EngineOpts,
): Promise<{
  results: Array<{ env: string; status: string; keys: string[] }>;
  failure: EngineFailure | null;
}> {
  const recipeId = process.env.RINGTAIL_MOCK_RECIPE ?? "mock";
  const results: Array<{ env: string; status: string; keys: string[] }> = [];
  for (const env of DEPLOYED_ENVS) {
    store.setCell(provider, env, "provisioning");
    const report = await provisionCredential(recipeId, {
      env,
      repoName: opts.repoName,
      envLocalPath: opts.envLocalPath,
    });
    store.setCell(provider, env, report.status);
    if (report.wroteLocal) store.setCell(provider, "local", report.status);
    results.push({ env, status: report.status, keys: report.keys }); // NAMES only
    if (report.status === "wrong-scope" || report.status === "failed") {
      return {
        results,
        failure: { env, status: report.status, reason: report.reason, missing: report.missing },
      };
    }
  }
  return { results, failure: null };
}

/** A value-free execution result. Exactly one shape is populated per outcome. */
export type ActionRunResult =
  | { id: string; blocked: true; missing: string[]; reason: string }
  | { id: string; needsConfirm: true; danger: "destructive" }
  | { id: string; executor: string; result: ActionResult }
  | {
      id: string;
      provider: string;
      results: Array<{ env: string; status: string; keys: string[] }>;
      failure: EngineFailure | null;
    };

/**
 * Run a mapped action through the gates. `confirmed` is the human's hard-confirm
 * for a destructive action — the ONLY thing that unlocks it. Unknown id → throw.
 * Returns names + status only (leak-guarded), never a secret value.
 */
export async function runAction(
  store: DaemonStore,
  id: string,
  opts: EngineOpts & { confirmed?: boolean },
): Promise<ActionRunResult> {
  const action = store.snapshot().actions.find((a) => a.id === id);
  if (!action) throw new Error(`unknown action: ${id}`);

  // 1. prerequisites — only prereqs that name a grid provider are machine-gated;
  //    free-text prereqs are informational. Unmet → blocked, not run.
  const grid = store.snapshot().grid;
  const missing = action.prerequisites.filter((p) => {
    const row = grid.find((r) => r.provider === p);
    return row ? !Object.values(row.envs).some((s) => CONNECTED.includes(s)) : false;
  });
  if (missing.length > 0) {
    return {
      id,
      blocked: true,
      missing,
      reason: `blocked — connect first: ${missing.join(", ")}`,
    };
  }

  // 2. hard-confirm — destructive never one-clicks.
  if (action.danger === "destructive" && !opts.confirmed) {
    return { id, needsConfirm: true, danger: "destructive" };
  }

  // 3. dispatch — a known typed executor, else the provisioning loop.
  const key = action.executor;
  const executor = key ? ACTION_EXECUTORS[key] : undefined;
  if (key && executor) {
    const result = await executor();
    return { id, executor: key, result };
  }
  const provider = action.wizard.provider ?? "mock";
  const { results, failure } = await runEngine(store, provider, opts);
  return { id, provider, results, failure };
}
