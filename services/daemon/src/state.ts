import {
  gridSeed,
  type Action,
  type CredentialStatus,
  type DaemonSnapshot,
  type GridEnv,
  type GridRow,
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
  readonly #subs = new Set<Subscriber>();

  /** ponytail: returns live refs (mutate-then-emit). Fine single-threaded; the
   * SSE layer JSON-serializes at send time so subscribers get an immutable copy. */
  snapshot(): DaemonSnapshot {
    return { grid: this.#grid, wizard: this.#wizard, actions: this.#actions };
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
}
