import {
  gridSeed,
  type Action,
  type ActiveProject,
  type ChatChoice,
  type ChatMessage,
  type CredentialStatus,
  type DaemonSnapshot,
  type GridEnv,
  type GridRow,
  type PendingMint,
  type SelectedAgent,
  type Step,
  type StepStatus,
  type Wizard,
} from "@ringtail/core";

/**
 * The daemon's ONE live state — the grid (providers × local/dev/staging/prod), the
 * current wizard, and the mapped actions. MCP tool calls mutate it; every mutation
 * pushes a fresh snapshot to subscribers (the dashboard's SSE stream). One source
 * of truth behind both the state channel (components) and, later, the chat channel.
 *
 * Value-free by construction: the grid holds statuses, the wizard holds step NAMES
 * + kinds. No secret value is ever stored here — pasted values go to @ringtail/store
 * (disk), never into this snapshot. THE GUARANTEE holds at the state layer too.
 */
export type Subscriber = (snap: DaemonSnapshot) => void;

export class DaemonStore {
  #grid: GridRow[] = gridSeed();
  #wizard: Wizard | null = null;
  #actions: Action[] = [];
  #chat: ChatMessage[] = [];
  /** user → agent queue: messages the user typed, waiting to ride back to the agent
   * as `pendingUserMessages` on its next tool call (drainInbox). The transcript (#chat)
   * is display; this is delivery. Value-free — intent text only, same as #chat. */
  #inbox: string[] = [];
  /** Onboarding gate state (architecture.md §"Entry & agent selection"): the agent
   * connected in step 1 + the project chosen in step 2. Names/paths only, no secrets.
   * The dashboard gates which step it shows off these two, restored from the primed
   * SSE snapshot on reload. */
  #agent: SelectedAgent | null = null;
  #project: ActiveProject | null = null;
  /** Consequential mints the agent proposed, awaiting a human approve. Carries the
   * server nonce so the dashboard can POST it back to /api/action — value-free (NAMES
   * + method + nonce, never a root/minted value). Cleared once approved. */
  #pendingMints: PendingMint[] = [];
  readonly #subs = new Set<Subscriber>();

  /** ponytail: returns live refs (mutate-then-emit). Fine single-threaded; the
   * SSE layer JSON-serializes at send time so subscribers get an immutable copy. */
  snapshot(): DaemonSnapshot {
    return {
      grid: this.#grid,
      wizard: this.#wizard,
      actions: this.#actions,
      chat: this.#chat,
      agent: this.#agent,
      project: this.#project,
      pendingMints: this.#pendingMints,
    };
  }

  /** Subscribe to state changes; primes the subscriber with the current snapshot. */
  subscribe(fn: Subscriber): () => void {
    this.#subs.add(fn);
    fn(this.snapshot());
    return () => {
      this.#subs.delete(fn);
    };
  }

  #emit(): void {
    const snap = this.snapshot();
    for (const fn of this.#subs) fn(snap);
  }

  /** Flip one grid cell (updateStatus). Unknown provider is a hard error. */
  setCell(provider: string, env: GridEnv, status: CredentialStatus): void {
    const row = this.#grid.find((r) => r.provider === provider);
    if (!row) throw new Error(`unknown provider: ${provider}`);
    row.envs[env] = status;
    this.#emit();
  }

  /** Seed the grid from local discovery: a provider whose root grant we already
   * hold shows `validated` (already-connected) across every env instead of `missing`
   * — the human paste step is skippable. Names only; the real validate-after-mint
   * still runs at provision, so a stale discovered key is caught there. */
  markDiscovered(providers: string[]): void {
    for (const p of providers) {
      const row = this.#grid.find((r) => r.provider === p);
      if (!row) continue;
      for (const e of Object.keys(row.envs) as GridEnv[]) row.envs[e] = "validated";
    }
    this.#emit();
  }

  /** Step 1 → connect (or disconnect) the coding agent. Clearing the agent also
   * clears the project — the onboarding gate falls all the way back to step 1. */
  setAgent(agent: SelectedAgent | null): void {
    this.#agent = agent;
    if (!agent) this.#project = null;
    this.#emit();
  }

  /** Step 2 → set (or clear) the active project. Names/path only. The daemon rebuilds
   * the grid from that project's `.env.example` via setGrid; this just tracks scope. */
  setProject(project: ActiveProject | null): void {
    this.#project = project;
    this.#emit();
  }

  /** Replace the whole grid — the (re)build from the chosen project's `.env.example`
   * (or the recipe-seeded default on reset). Statuses + var NAMES only, never values. */
  setGrid(grid: GridRow[]): void {
    this.#grid = grid;
    this.#emit();
  }

  /** Push a validated wizard to the cockpit (renderWizard). */
  setWizard(wizard: Wizard | null): void {
    this.#wizard = wizard;
    this.#emit();
  }

  /** Push mapped actions to the cockpit (renderActions). */
  setActions(actions: Action[]): void {
    this.#actions = actions;
    this.#emit();
  }

  /** Advance one wizard step (the agent checks steps off, streamed). */
  markStep(stepId: string, status: StepStatus): void {
    const step = this.findStep(stepId);
    step.status = status;
    this.#emit();
  }

  findStep(stepId: string): Step {
    const step = this.#wizard?.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`unknown step: ${stepId}`);
    return step;
  }

  // ── chat: the direction channel (relayed through the daemon) ────────────────

  /** Agent → user (sendChat MCP tool). Appends to the transcript, pushes to the UI.
   * Optional `choices` render as tappable pills below the text (Delulus-chat style) —
   * intent labels/values only, never a secret value. */
  sendAgentMessage(text: string, choices?: ChatChoice[]): void {
    this.#chat.push({
      role: "agent",
      text,
      ts: Date.now(),
      ...(choices?.length ? { choices } : {}),
    });
    this.#emit();
  }

  /** User → agent (POST /api/chat). Appends to the transcript (so it renders at once)
   * AND queues it for the agent, delivered as `pendingUserMessages` on its next tool
   * call (drainInbox). Intent text only, never a value. */
  postUserMessage(text: string): void {
    this.#chat.push({ role: "user", text, ts: Date.now() });
    this.#inbox.push(text);
    this.#emit();
  }

  // ── pending mints: the unforgeable human-approve queue ──────────────────────

  /** Park a consequential mint the agent proposed (mintKey) → renders on the dashboard
   * with an Approve button. The nonce rides the SSE snapshot to the dashboard ONLY. */
  addPendingMint(pending: PendingMint): void {
    this.#pendingMints.push(pending);
    this.#emit();
  }

  /** Drop a parked mint once its nonce has been approved (or dismissed). */
  clearPendingMint(nonce: string): void {
    this.#pendingMints = this.#pendingMints.filter((p) => p.nonce !== nonce);
    this.#emit();
  }

  /** Drain pending user direction → `pendingUserMessages` on the agent's next tool
   * call (plan/executeStep/updateStatus/authorWizard). Returns + clears the inbox. */
  drainInbox(): string[] {
    const pending = this.#inbox;
    this.#inbox = [];
    return pending;
  }
}
