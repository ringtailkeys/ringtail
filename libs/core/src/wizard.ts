import { z } from "zod";
import type { CredentialStatus } from "./index";

/**
 * The unified generative-UI contract (architecture.md §"The unified contract").
 * ONE schema for setup AND actions, rendered by the universal 1-2-3 wizard. It is
 * a zod schema, not just a TS interface, because it's the TRUST BOUNDARY: every
 * agent-supplied Wizard/Action crosses MCP and is schema-validated before the
 * daemon touches it — malformed → rejected (Guardrail #1). The inferred types are
 * what the daemon mutates and the dashboard renders, so the contract lives ONCE
 * here (a lib) and both service + app import it. NEVER carries a secret value —
 * `paste` steps carry a var NAME (`payload.varName`); the value flows out-of-band
 * (user → daemon), never through this schema.
 */

export const StepKindSchema = z.enum(["open-url", "paste", "auto", "confirm"]);
export type StepKind = z.infer<typeof StepKindSchema>;

/** Where a step sits on the 1-2-3 track (agent checks these off, streamed). */
export const StepStatusSchema = z.enum(["pending", "active", "done", "failed"]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const DangerSchema = z.enum(["safe", "confirm", "destructive"]);
export type Danger = z.infer<typeof DangerSchema>;

export const StepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  kind: StepKindSchema,
  payload: z
    .object({
      // open-url deep-link — https only (Guardrail #3, allowlist enforced daemon-side).
      url: z.string().url().optional(),
      // paste target env-var NAME (never the value).
      varName: z.string().optional(),
      scopes: z.array(z.string()).optional(),
    })
    .optional(),
  danger: DangerSchema.optional(),
  status: StepStatusSchema,
});
export type Step = z.infer<typeof StepSchema>;

export const WizardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  provider: z.string().optional(),
  steps: z.array(StepSchema).min(1),
});
export type Wizard = z.infer<typeof WizardSchema>;

export const ActionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  why: z.string(),
  prerequisites: z.array(z.string()),
  danger: DangerSchema,
  wizard: WizardSchema,
});
export type Action = z.infer<typeof ActionSchema>;

// ── the env axis (architecture.md §"The env axis") ───────────────────────────
// local · dev · staging · prod. local = your machine (.env.local); the rest are
// deployed (Infisical only). The dashboard grid renders all four columns.
export const GRID_ENVS = ["local", "dev", "staging", "prod"] as const;
export type GridEnv = (typeof GRID_ENVS)[number];

/** One provider row in the live grid: env-var names + a status per env column. */
export interface GridRow {
  provider: string;
  envVars: string[];
  envs: Record<GridEnv, CredentialStatus>;
}

/**
 * One line in the dashboard conversation. The chat is the DIRECTION channel (the
 * user steers; the agent converses) alongside the state channel (grid/wizard/actions),
 * one agent behind both. Carries intent/TEXT only — NEVER a secret value; paste still
 * bypasses the agent (user → daemon). `role` says who spoke; `ts` orders the thread.
 */
export interface ChatMessage {
  role: "agent" | "user";
  text: string;
  ts: number;
}

/**
 * The whole live daemon state, streamed to the dashboard over SSE. ONE source of
 * truth: MCP tool calls mutate it → the daemon pushes this snapshot → the cockpit
 * re-renders. Value-free by construction (grid = statuses, wizard = names + kinds,
 * chat = intent text). The agent both converses (chat) and renders (grid/wizard/
 * actions) over the same MCP connection — the dashboard is a conversation, not a board.
 */
export interface DaemonSnapshot {
  grid: GridRow[];
  wizard: Wizard | null;
  actions: Action[];
  chat: ChatMessage[];
}
