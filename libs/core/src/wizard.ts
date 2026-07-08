import { z } from "zod";
import type { MintChoices } from "./discovery";
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
  // Optional dispatch key for a repo-specific / cross-tool TYPED executor (e.g.
  // "domain-to-cf"). When set + known, the daemon runs that executor with the
  // stored root creds; when absent, the action falls back to its wizard's
  // provisioning loop. Names/intent only — an executor NEVER returns a secret value.
  executor: z.string().optional(),
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
 * A tappable choice pill in the chat (Delulus-chat style). The agent offers next
 * moves as pills, not a wall of text. TRUST BOUNDARY: `label` is what the pill shows,
 * `value` is the reply INTENT posted back through the user → agent path when tapped —
 * both are intent/text only, NEVER a secret value. paste still bypasses the agent, so
 * a choice can only ever carry a name/intent (check:no-leak stays green).
 */
export const ChatChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
});
export type ChatChoice = z.infer<typeof ChatChoiceSchema>;

/**
 * One line in the dashboard conversation. The chat is the DIRECTION channel (the
 * user steers; the agent converses) alongside the state channel (grid/wizard/actions),
 * one agent behind both. Carries intent/TEXT only — NEVER a secret value; paste still
 * bypasses the agent (user → daemon). `role` says who spoke; `ts` orders the thread.
 * An agent line may offer `choices` — tappable pills rendered below the text. Zod, not
 * an interface: it's the trust boundary — the daemon validates every agent-supplied
 * message (malformed rejected) before it touches the snapshot.
 */
export const ChatMessageSchema = z.object({
  role: z.enum(["agent", "user"]),
  text: z.string(),
  ts: z.number(),
  choices: z.array(ChatChoiceSchema).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** The coding agent the founder connected in step 1 (names only, never a token). */
export interface SelectedAgent {
  id: string;
  name: string;
}

/** The local project chosen in step 2 — Ringtail reads its `.env.example` as the
 * manifest. Path + name only; no file contents, no secrets. */
export interface ActiveProject {
  path: string;
  name: string;
}

/**
 * The whole live daemon state, streamed to the dashboard over SSE. ONE source of
 * truth: MCP tool calls mutate it → the daemon pushes this snapshot → the cockpit
 * re-renders. Value-free by construction (grid = statuses, wizard = names + kinds,
 * chat = intent text). The agent both converses (chat) and renders (grid/wizard/
 * actions) over the same MCP connection — the dashboard is a conversation, not a board.
 *
 * `agent` + `project` drive the onboarding gate: no agent → step 1 (connect); agent
 * but no project → step 2 (pick project); both → step 3 (the cockpit). Persisted here
 * so a dashboard reload restores the right step off the primed SSE snapshot.
 */
/**
 * A parked consequential mint awaiting an out-of-band HUMAN approve (the "Next steps"
 * panel renders these with an Approve button). Value-free: NAMES + method + the server
 * `nonce`. The nonce is the UNFORGEABLE approval token — it rides the SSE snapshot to
 * the dashboard, and only a `POST /api/action` carrying it back executes the mint. It
 * is NEVER returned to the agent over MCP, so the agent that proposed can't self-approve.
 */
export interface PendingMint {
  /** Public correlation id (handed to the agent as `needs-confirm` evidence). */
  id: string;
  /** The server-generated approval secret — dashboard-only; required by POST /api/action. */
  nonce: string;
  providerAccount: string;
  method: string;
  danger?: Danger;
  /** The env-var the mint would file (a NAME, never a value) — shown on the approve card. */
  varName?: string;
  /**
   * GUIDED least-privilege mint (PRD §4.5): the value-free menu the human steers with — the
   * discovered resources (NAMES/ids), the least-privilege permission options + the suggested
   * (narrowest) default, and whether expiry applies. Present only when the agent flagged the
   * mint `discover`; the dashboard renders it, the human's {resource, permission, expiry}
   * selection rides back with the nonce on POST /api/action. Carries no secret value.
   */
  choices?: MintChoices;
}

/**
 * The account/entitlement state, fetched from the hosted control-plane (Better Auth
 * sign-in + Dodo billing) and streamed to the dashboard so the sign-in GATE and the
 * freemium enforcement render off the ONE SSE snapshot, same as everything else.
 * Value-free: email + tier + a server-side usage COUNT — never a session token, never
 * a provider secret (the daemon holds the session privately; only names/counts surface).
 */
export interface AuthState {
  signedIn: boolean;
  email?: string;
  tier?: "free" | "pro";
  /** The SERVER-SIDE provision count that gates the free tier (reinstall can't reset it). */
  usage?: { projectsProvisioned: number; freeLimit: number };
  /** ISO date the Pro subscription renews — surfaced on the account view (never a token). */
  expiresAt?: string;
  /** Set when the last /api/usage returned allowed:false → the dashboard opens the upgrade modal. */
  limitReached?: boolean;
}

export interface DaemonSnapshot {
  grid: GridRow[];
  wizard: Wizard | null;
  actions: Action[];
  chat: ChatMessage[];
  agent: SelectedAgent | null;
  project: ActiveProject | null;
  /** Consequential mints the agent proposed, awaiting a human approve (unforgeable nonce). */
  pendingMints: PendingMint[];
  /** Account/entitlement — drives the sign-in gate + freemium enforcement. */
  auth: AuthState;
  /** Which edition the daemon runs. `oss` (default, `ringtail up` from source) → the
   * dashboard renders ①②③ directly, NO sign-in wall, NO upgrade modal. `app` (native
   * desktop) → the full gated experience. The gate is a conditional layer, not a fork. */
  edition: "oss" | "app";
}
