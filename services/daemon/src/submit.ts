import { putCredential } from "@ringtail/store";
import type { DaemonStore } from "./state";

/**
 * applyStep — the ONE inbound step-completion path, shared by the MCP `submitStep`
 * tool (agent-driven, for open-url/confirm) AND the token-gated `POST /api/step`
 * route (the BROWSER paste path, user → daemon). Extracted so both callers route
 * through one place: THE GUARANTEE lives here — a `paste` value is written to disk
 * (@ringtail/store) and the returned result carries only the var NAME + status,
 * NEVER the value. It never enters the DaemonStore snapshot either, so it can't
 * reach the SSE stream or any tool response. Value-free result by construction.
 */
export interface StepResult {
  stepId: string;
  varName?: string;
  status: "done";
}

export function applyStep(store: DaemonStore, stepId: string, value?: string): StepResult {
  const step = store.findStep(stepId);
  if (step.kind === "paste") {
    if (!value) throw new Error(`paste step ${stepId} requires a value`);
    const varName = step.payload?.varName ?? stepId;
    // value → disk, NEVER into the snapshot or the response.
    putCredential(varName, {
      value,
      provider: store.snapshot().wizard?.provider ?? "unknown",
      updatedAt: new Date().toISOString(),
    });
    store.markStep(stepId, "done");
    return { stepId, varName, status: "done" }; // names + status only
  }
  store.markStep(stepId, "done");
  return { stepId, status: "done" };
}
