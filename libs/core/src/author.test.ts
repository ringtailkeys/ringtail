// authorWizard: every curated recipe → a schema-valid setup wizard, names only.
import { expect, test } from "bun:test";
import { RECIPES } from "@ringtail/recipes";
import { authorWizard, WizardSchema } from "./index";

test("every recipe authors a schema-valid, value-free wizard", () => {
  for (const id of Object.keys(RECIPES)) {
    const w = authorWizard(id);
    expect(() => WizardSchema.parse(w)).not.toThrow();
    expect(w.provider).toBe(id);
    // Last step is always the provision auto-step (or the sole generate step).
    expect(w.steps.at(-1)?.kind).toBe("auto");
    // paste steps carry a var NAME, never a value field.
    for (const s of w.steps) {
      if (s.kind === "paste") expect(s.payload?.varName).toBeTruthy();
      expect(JSON.stringify(s)).not.toContain("value");
    }
  }
});

test("generate recipe (better-auth) is a single auto step, no paste", () => {
  const w = authorWizard("better-auth");
  expect(w.steps).toHaveLength(1);
  expect(w.steps[0]?.kind).toBe("auto");
  expect(w.steps.some((s) => s.kind === "paste")).toBe(false);
});

test("guided recipe (cloudflare) → open-url + paste(root) + provision", () => {
  const w = authorWizard("cloudflare");
  const kinds = w.steps.map((s) => s.kind);
  expect(kinds).toEqual(["open-url", "paste", "auto"]);
  const paste = w.steps.find((s) => s.kind === "paste");
  expect(paste?.payload?.varName).toBe("CLOUDFLARE_API_TOKEN");
});

test("unknown recipe throws", () => {
  expect(() => authorWizard("nope")).toThrow();
});
