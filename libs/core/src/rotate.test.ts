// Unit proof of the ROTATION state machine (PRD Phase 2): every transition + every failure
// branch, pure (no network). The effects are fakes with call-tracking flags — the orchestrator
// owns the rollback logic, so this is where that logic is nailed down.
import { expect, test } from "bun:test";
import { type RotationEffects, runRotation } from "./rotate";

interface FakeOpts {
  oldKeyId?: string;
  mintOk?: boolean;
  reconfigureOk?: boolean;
  validateOk?: boolean;
  revokeOk?: boolean;
  newKeyId?: string;
}

/** A fake effects set with tunable outcomes + call trackers. */
function fakeFx(o: FakeOpts = {}): {
  fx: RotationEffects;
  calls: { mint: number; reconfigure: number; validate: number; revoke: number; restore: number };
} {
  const calls = { mint: 0, reconfigure: 0, validate: 0, revoke: 0, restore: 0 };
  const fx: RotationEffects = {
    varName: "ROTATE_ME",
    oldKeyId: "oldKeyId" in o ? o.oldKeyId : "old_1",
    async mintNew() {
      calls.mint++;
      return o.mintOk === false
        ? { ok: false, reason: "boom" }
        : { ok: true, newKeyId: o.newKeyId ?? "new_2" };
    },
    async reconfigure() {
      calls.reconfigure++;
      return o.reconfigureOk === false ? { ok: false, reason: "disk full" } : { ok: true };
    },
    ...(o.validateOk === undefined
      ? {}
      : {
          validate: async (): Promise<boolean> => {
            calls.validate++;
            return o.validateOk === true;
          },
        }),
    async revokeOld() {
      calls.revoke++;
      return o.revokeOk === false ? { ok: false, reason: "429" } : { ok: true };
    },
    async restore() {
      calls.restore++;
    },
  };
  return { fx, calls };
}

test("happy path → done: mint → reconfigure → revoke, no restore", async () => {
  const { fx, calls } = fakeFx();
  const out = await runRotation(fx);
  expect(out.state).toBe("done");
  expect(out.oldKeyId).toBe("old_1");
  expect(out.newKeyId).toBe("new_2");
  expect(calls).toEqual({ mint: 1, reconfigure: 1, validate: 0, revoke: 1, restore: 0 });
});

test("mint fails → aborted: old key kept, sink NOT touched, NOT revoked", async () => {
  const { fx, calls } = fakeFx({ mintOk: false });
  const out = await runRotation(fx);
  expect(out.state).toBe("aborted");
  expect(out.reason).toContain("old key kept");
  expect(out.newKeyId).toBeUndefined();
  // no reconfigure (nothing written), no restore (nothing to undo), no revoke.
  expect(calls).toEqual({ mint: 1, reconfigure: 0, validate: 0, revoke: 0, restore: 0 });
});

test("sink-write fails → aborted: RESTORE the old value, NOT revoked", async () => {
  const { fx, calls } = fakeFx({ reconfigureOk: false });
  const out = await runRotation(fx);
  expect(out.state).toBe("aborted");
  expect(out.reason).toContain("restored old key");
  expect(calls.restore).toBe(1);
  expect(calls.revoke).toBe(0);
});

test("validate fails → aborted: RESTORE the old value, NOT revoked", async () => {
  const { fx, calls } = fakeFx({ validateOk: false });
  const out = await runRotation(fx);
  expect(out.state).toBe("aborted");
  expect(out.reason).toContain("failed validation");
  expect(calls).toEqual({ mint: 1, reconfigure: 1, validate: 1, revoke: 0, restore: 1 });
});

test("validate passes → revoke runs → done", async () => {
  const { fx, calls } = fakeFx({ validateOk: true });
  const out = await runRotation(fx);
  expect(out.state).toBe("done");
  expect(calls).toEqual({ mint: 1, reconfigure: 1, validate: 1, revoke: 1, restore: 0 });
});

test("revoke fails AFTER switch → partial: new key live, 'revoke manually', NO restore", async () => {
  const { fx, calls } = fakeFx({ revokeOk: false });
  const out = await runRotation(fx);
  expect(out.state).toBe("partial");
  expect(out.reason).toContain("revoke it manually");
  expect(out.reason).toContain("old_1");
  // the sink already points at the working new key → we must NOT roll it back.
  expect(calls.restore).toBe(0);
  expect(calls.revoke).toBe(1);
});

test("no old key id → done without a revoke (nothing to revoke by id)", async () => {
  const { fx, calls } = fakeFx({ oldKeyId: undefined });
  const out = await runRotation(fx);
  expect(out.state).toBe("done");
  expect(out.oldKeyId).toBeUndefined();
  expect(calls.revoke).toBe(0);
});
