// UNIT tests for the multi-root registry (PRD §4.4) — the store pieces in isolation, no daemon.
// Each test runs against a throwaway RINGTAIL_HOME so the vault state is hermetic.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addRoot,
  listRoots,
  listRootsFor,
  putRoot,
  readStore,
  resolveRoot,
  resolveRootById,
  writeStore,
} from "./index";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-store-"));
  process.env.RINGTAIL_HOME = join(dir, "home");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.RINGTAIL_HOME;
});

test("addRoot appends MANY named roots per provider; listRoots is value-free", () => {
  addRoot({ provider: "resend", label: "prod", value: "SECRET-PROD" });
  addRoot({ provider: "resend", label: "staging", value: "SECRET-STAGING" });
  const roots = listRoots("resend");
  expect(roots.length).toBe(2);
  expect(roots.map((r) => r.label).toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual([
    "prod",
    "staging",
  ]);
  // THE GUARANTEE: the value-free view carries NO secret (structurally no `value` field).
  const blob = JSON.stringify(roots);
  expect(blob).not.toContain("SECRET-PROD");
  expect(blob).not.toContain("SECRET-STAGING");
  expect(roots.every((r) => !("value" in r))).toBe(true);
});

test("putRoot UPSERTS the label-less root — one per provider(:account), value replaced", () => {
  putRoot("resend", "FIRST");
  putRoot("resend", "SECOND"); // same provider, no label → replaces, not appends
  expect(listRootsFor("resend").length).toBe(1);
  expect(resolveRoot("resend")).toBe("SECOND");
});

test("resolveRoot: zero→null, exactly-one→value, ambiguous(>1)→null", () => {
  expect(resolveRoot("resend")).toBeNull(); // none held
  putRoot("resend", "ONLY");
  expect(resolveRoot("resend")).toBe("ONLY"); // exactly one
  addRoot({ provider: "resend", label: "extra", value: "OTHER" });
  expect(resolveRoot("resend")).toBeNull(); // two now → ambiguous, the flow must ask
});

test("resolveRootById returns the SPECIFIC root's value; unknown id→null", () => {
  const prod = addRoot({ provider: "resend", label: "prod", value: "V-PROD" });
  const staging = addRoot({ provider: "resend", label: "staging", value: "V-STAGING" });
  expect(resolveRootById(prod.id)).toBe("V-PROD");
  expect(resolveRootById(staging.id)).toBe("V-STAGING");
  expect(resolveRootById("nope")).toBeNull();
});

test("account suffix distinguishes roots (agency multi-account)", () => {
  putRoot("resend", "MAIN");
  putRoot("resend:Client-X", "CLIENT");
  expect(resolveRoot("resend")).toBe("MAIN");
  expect(resolveRoot("resend:Client-X")).toBe("CLIENT");
  expect(resolveRoot("resend:client-x")).toBeNull(); // account case is preserved (not lowercased)
  expect(listRootsFor("resend").length).toBe(1); // account-empty match only
});

test("provider segment is case-insensitive (allowlist/spec keys are lowercase)", () => {
  putRoot("Resend", "CASED");
  expect(resolveRoot("resend")).toBe("CASED");
  expect(resolveRoot("RESEND")).toBe("CASED");
});

test("backward-compat: a legacy `roots` map is READ, then MIGRATED forward on the next write", () => {
  // Simulate an OLD store file: only the legacy map, no registry.
  writeStore({
    credentials: {},
    roots: { resend: { value: "LEGACY", updatedAt: "2026-01-01T00:00:00Z" } },
  });
  // Read path merges the legacy map → resolvable without any migration write yet.
  expect(resolveRoot("resend")).toBe("LEGACY");
  expect(listRoots("resend").length).toBe(1);

  // A registry write migrates the legacy map FORWARD (upsert the same label-less root).
  putRoot("resend", "NEW");
  const store = readStore();
  expect(store.roots ?? {}).toEqual({}); // legacy map dropped
  expect(store.rootRegistry?.length).toBe(1); // folded into the registry
  expect(resolveRoot("resend")).toBe("NEW");
});
