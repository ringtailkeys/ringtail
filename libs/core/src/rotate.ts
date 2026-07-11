/**
 * Credential ROTATION — the explicit state machine (PRD Phase 2).
 *
 *   minting → reconfiguring → validating → revoking → done
 *                                                    ↘ partial   (switched, old NOT revoked)
 *              ↘─────────── aborted ────────────↙                (mint/sink/validate failed)
 *
 * Rotating a credential (e.g. RESEND_API_KEY) must be atomic-ish and NEVER leave the project
 * broken. The rungs:
 *   1. mint-new     — mint a fresh scoped key (reuses the guided/scoped mint machinery).
 *   2. reconfigure  — write the NEW key to the sink, keeping the OLD value recoverable.
 *   3. validate     — (optional) prove the new key works BEFORE killing the old.
 *   4. revoke-old   — call the provider's revoke endpoint for the OLD key.
 *
 * SAFE rollback (the hard part):
 *   - mint fails            → ABORT, old key untouched + still live (project keeps working). No revoke.
 *   - sink-write fails      → ABORT, RESTORE the old sink value. No revoke.
 *   - validate fails        → ABORT, RESTORE the old sink value. No revoke.
 *   - revoke fails AFTER the sink switched → PARTIAL: the new key is live + working, surface a
 *     clear "old key NOT revoked — revoke manually" status. Do NOT restore (the new key works).
 *
 * THE GUARANTEE holds: this orchestrator is VALUE-FREE by construction — every secret value
 * (old + minted) lives inside the injected `RotationEffects` closure (the daemon-local adapter);
 * the state machine only ever sees ids + ok/fail + reasons. Pure + injectable → unit-testable
 * with no network (each transition + every failure branch).
 */

/** The rotation state machine's states. The last four are terminal outcomes. */
export type RotationState =
  | "minting"
  | "reconfiguring"
  | "validating"
  | "revoking"
  | "done"
  | "aborted"
  | "partial";

/** The value-free result of a rotation run — ids + terminal state + a reason, NEVER a value. */
export interface RotationOutcome {
  varName: string;
  /** A terminal state: `done` (clean) · `aborted` (rolled back to old) · `partial` (switched, not revoked). */
  state: RotationState;
  oldKeyId?: string;
  newKeyId?: string;
  /** Plain-language cause / manual-action note. No value. */
  reason?: string;
}

/**
 * The daemon-local side-effects the orchestrator drives. Every method is VALUE-FREE at the
 * boundary: the adapter holds the minted/old values in its closure and returns only ids +
 * ok/fail. The orchestrator sequences these + owns the rollback logic; the adapter owns the
 * network + the sink writes.
 */
export interface RotationEffects {
  varName: string;
  /** The OLD key's provider id (for revoke + the audit record), or undefined if unknown. */
  oldKeyId?: string;
  /** Mint the fresh scoped key at the provider (holds the value internally). */
  mintNew(): Promise<{ ok: true; newKeyId?: string } | { ok: false; reason: string }>;
  /** Write the freshly-minted value into the sink under `varName` (the OLD value stays
   * recoverable via `restore` until revoke succeeds). */
  reconfigure(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** OPTIONAL value-free check that the new key actually works, before killing the old one. */
  validate?(): Promise<boolean>;
  /** Revoke the OLD key by id at the provider (consequential; the human already approved). */
  revokeOld(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Roll the sink back to the OLD value (abort path). */
  restore(): Promise<void>;
}

/**
 * Run one rotation end-to-end. Pure control flow over the injected effects — the ONLY place
 * the rollback semantics live, so they're tested once. Returns a value-free terminal outcome.
 */
export async function runRotation(fx: RotationEffects): Promise<RotationOutcome> {
  const base = { varName: fx.varName, ...(fx.oldKeyId ? { oldKeyId: fx.oldKeyId } : {}) };

  // ── minting ──────────────────────────────────────────────────────────────
  const mint = await fx.mintNew();
  if (!mint.ok) {
    // The sink was never touched → the old key is still live. Nothing to restore, nothing to
    // revoke: the project stays on the working old key.
    return { ...base, state: "aborted", reason: `mint failed — old key kept: ${mint.reason}` };
  }
  const out = { ...base, ...(mint.newKeyId ? { newKeyId: mint.newKeyId } : {}) };

  // ── reconfiguring (switch the sink to the new key) ─────────────────────────
  const recfg = await fx.reconfigure();
  if (!recfg.ok) {
    await fx.restore(); // put the old value back — the project keeps working on the old key
    return {
      ...out,
      state: "aborted",
      reason: `sink write failed — restored old key: ${recfg.reason}`,
    };
  }

  // ── validating (optional; the new key is now in the sink) ──────────────────
  if (fx.validate && !(await fx.validate())) {
    await fx.restore(); // new key doesn't work → roll back to the old, do NOT revoke
    return { ...out, state: "aborted", reason: "new key failed validation — restored old key" };
  }

  // ── revoking (kill the old key; the new one is live + validated) ───────────
  if (fx.oldKeyId) {
    const rev = await fx.revokeOld();
    if (!rev.ok) {
      // The sink already points at the NEW working key — do NOT restore. Surface a clear
      // manual-action status so the human kills the old key by hand.
      return {
        ...out,
        state: "partial",
        reason: `new key is live, but the OLD key (${fx.oldKeyId}) was NOT revoked — revoke it manually: ${rev.reason}`,
      };
    }
  }

  return { ...out, state: "done" };
}
