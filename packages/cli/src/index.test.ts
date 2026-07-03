import { resolve } from "node:path";
import { readPlan } from "@ringtail/core";
import { expect, test } from "bun:test";

// The repo's own .env.example is the manifest under test.
const EXAMPLE = resolve(import.meta.dir, "../../../.env.example");

test("readPlan parses the manifest into sectioned entries", () => {
  const plan = readPlan(EXAMPLE, {}); // empty env → everything missing
  const keys = plan.map((e) => e.key);
  expect(keys).toContain("CLOUDFLARE_API_TOKEN");
  expect(keys).toContain("INFISICAL_ENVIRONMENT");
  expect(plan.every((e) => e.present === false)).toBe(true);
  expect(plan.find((e) => e.key === "CLOUDFLARE_API_TOKEN")?.section).toBe("Cloudflare");
});

test("present reflects the live env, not the example's RHS", () => {
  // INFISICAL_ENVIRONMENT=dev is written in the file, but absent from env → missing.
  const plan = readPlan(EXAMPLE, { CLOUDFLARE_API_TOKEN: "live-value" });
  expect(plan.find((e) => e.key === "CLOUDFLARE_API_TOKEN")?.present).toBe(true);
  expect(plan.find((e) => e.key === "INFISICAL_ENVIRONMENT")?.present).toBe(false);
});
