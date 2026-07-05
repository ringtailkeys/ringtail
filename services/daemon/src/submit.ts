import { putCredential } from "@ringtail/store";
import { type EngineFailure, type EngineOpts, runEngine } from "./action";
import type { DaemonStore } from "./state";

/**
 * applyStep — the ONE inbound step-completion path, shared by the MCP `submitStep`
 * tool (agent-driven, for open-url/confirm) AND the token-gated `POST /api/step`
 * route (the BROWSER paste path, user → daemon). Extracted so both callers route
 * through one place: THE GUARANTEE lives here — a `paste` value is written to disk
 * (@ringtail/store) and the returned result carries only the var NAME + status,
 * NEVER the value. It never enters the DaemonStore snapshot either, so it can't
 * reach the SSE stream or any tool response. Value-free result by construction.
 *
 * Event-driven auto-advance: when a `paste` completes and the very next step is a
 * SAFE `auto` step (mint → validate-after-mint → provision → sync), the daemon runs
 * it ITSELF through the SAME runEngine path executeStep uses — no agent round-trip,
 * the dashboard reflects it live over SSE. A `confirm`/`destructive` next step is
 * NEVER auto-run (that still needs an explicit executeAction(confirmed:true)).
 */
export interface StepResult {
  stepId: string;
  varName?: string;
  status: "done";
  /** Present when the paste auto-advanced the next safe auto step. Names + status
   * only (runEngine emits key NAMES, never values) — THE GUARANTEE holds. */
  autoAdvanced?: {
    stepId: string;
    provider: string;
    results: Array<{ env: string; status: string; keys: string[] }>;
    failure: EngineFailure | null;
  };
}

export async function applyStep(
  store: DaemonStore,
  stepId: string,
  value?: string,
  engineOpts?: EngineOpts,
): Promise<StepResult> {
  const step = store.findStep(stepId);
  if (step.kind !== "paste") {
    store.markStep(stepId, "done");
    return { stepId, status: "done" };
  }

  if (!value) throw new Error(`paste step ${stepId} requires a value`);
  const varName = step.payload?.varName ?? stepId;
  // value → disk, NEVER into the snapshot or the response.
  putCredential(varName, {
    value,
    provider: store.snapshot().wizard?.provider ?? "unknown",
    updatedAt: new Date().toISOString(),
  });
  store.markStep(stepId, "done");

  // Auto-advance: run the next step iff it's a genuinely SAFE auto step and we have
  // engine opts. Only `safe` (or unlabelled) auto-runs — a `confirm` OR `destructive`
  // step is consequential and NEVER one-clicks off a paste; it waits for an explicit
  // human-confirmed executeAction. (Matches the mint engine's "non-safe needs confirm"
  // floor — the three execution paths agree on what may run unattended.)
  const steps = store.snapshot().wizard?.steps ?? [];
  const next = steps[steps.findIndex((s) => s.id === stepId) + 1];
  if (engineOpts && next && next.kind === "auto" && (next.danger ?? "safe") === "safe") {
    store.markStep(next.id, "active");
    const provider = store.snapshot().wizard?.provider ?? "mock";
    const { results, failure } = await runEngine(store, provider, engineOpts);
    store.markStep(next.id, failure ? "failed" : "done");
    return {
      stepId,
      varName,
      status: "done",
      autoAdvanced: { stepId: next.id, provider, results, failure },
    };
  }

  return { stepId, varName, status: "done" }; // names + status only
}
