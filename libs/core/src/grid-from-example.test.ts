// gridFromExample: build the cockpit grid from a CHOSEN project's `.env.example`
// (step 2 of onboarding). One section → one provider row; a cell is `validated` when
// every var in the section is present in the live env, else `missing`. NAMES only —
// the RHS holds no values, so nothing secret is ever read.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gridFromExample } from "./index";

test("gridFromExample groups by section and flags present vs missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ringtail-grid-"));
  const examplePath = join(dir, ".env.example");
  writeFileSync(
    examplePath,
    [
      "# ── Cloudflare ──",
      "CLOUDFLARE_API_TOKEN=",
      "CLOUDFLARE_ACCOUNT_ID=",
      "# ── Database ──",
      "DATABASE_URL=",
    ].join("\n"),
  );

  // Live env: Cloudflare fully present, Database absent.
  const grid = gridFromExample(examplePath, {
    CLOUDFLARE_API_TOKEN: "x",
    CLOUDFLARE_ACCOUNT_ID: "y",
  });

  expect(grid.map((r) => r.provider)).toEqual(["Cloudflare", "Database"]);
  expect(grid[0]?.envVars).toEqual(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]);
  // every var present → validated across all four env columns
  expect(grid[0]?.envs).toEqual({
    local: "validated",
    dev: "validated",
    staging: "validated",
    prod: "validated",
  });
  // missing var → missing
  expect(grid[1]?.envs.local).toBe("missing");

  // No secret VALUE ever appears — only names + statuses.
  expect(JSON.stringify(grid)).not.toContain("x");

  // Missing file → empty grid.
  expect(gridFromExample(join(dir, "nope.example"), {})).toEqual([]);

  rmSync(dir, { recursive: true, force: true });
});
