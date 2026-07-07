import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readPlan } from "@ringtail/core";
import { expect, test } from "bun:test";
import { run } from "./index";

/** Run `run(argv)` in `cwd`, capturing stdout — restores cwd + console after. */
function capture(cwd: string, argv: string[]): { code: number; out: string } {
  const origCwd = process.cwd();
  const origLog = console.log;
  let out = "";
  console.log = (...a: unknown[]) => {
    out += `${a.join(" ")}\n`;
  };
  process.chdir(cwd);
  try {
    const code = run(argv) as number; // plan() is sync
    return { code, out };
  } finally {
    process.chdir(origCwd);
    console.log = origLog;
  }
}

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

test("bare `ringtail` with no manifest is a helpful message, not a raw error (exit 0)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt-cli-"));
  const { code, out } = capture(dir, []);
  expect(code).toBe(0);
  expect(out).toContain("nothing to provision here");
});

test("--json emits a valid empty plan (never an error stream) with no manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt-cli-"));
  const { code, out } = capture(dir, ["--json"]);
  expect(code).toBe(0);
  expect(JSON.parse(out)).toEqual({ missing: [], total: 0 });
});

test(".env.local NAMES surface as present, not missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt-cli-"));
  writeFileSync(join(dir, ".env.example"), "# ── Cloudflare ──\nCLOUDFLARE_API_TOKEN=\n");
  writeFileSync(join(dir, ".env.local"), "CLOUDFLARE_API_TOKEN=already-provisioned\n");
  const { code, out } = capture(dir, ["--json"]);
  expect(code).toBe(0);
  // provisioned in .env.local → not in the missing list
  expect(JSON.parse(out)).toEqual({ missing: [], total: 1 });
});
