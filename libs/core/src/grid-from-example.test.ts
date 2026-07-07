// gridFromExample: build the cockpit grid from a CHOSEN project's `.env.example`
// (step 2 of onboarding). One section → one provider row; a cell is `validated` when
// every var in the section is present in the live env, else `missing`. NAMES only —
// the RHS holds no values, so nothing secret is ever read.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProvider, gridFromExample } from "./index";

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

test("plain `# Header` comments split into rows (a NORMAL .env.example, not box-drawing)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ringtail-grid-plain-"));
  const examplePath = join(dir, ".env.example");
  writeFileSync(
    examplePath,
    [
      "# Database",
      "DATABASE_URL=",
      "## Auth",
      "BETTER_AUTH_SECRET=",
      "# ---- Email ----",
      "RESEND_API_KEY=",
      "# See https://dashboard.example.com for these", // prose comment — must NOT become a row
    ].join("\n"),
  );

  const grid = gridFromExample(examplePath, {});
  expect(grid.map((r) => r.provider)).toEqual(["Database", "Auth", "Email"]);
  expect(grid[0]?.envVars).toEqual(["DATABASE_URL"]);
  expect(grid[2]?.envVars).toEqual(["RESEND_API_KEY"]);
  rmSync(dir, { recursive: true, force: true });
});

test("header-LESS vars route to their provider by name (recipes fast-path can engage)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ringtail-grid-noheader-"));
  const examplePath = join(dir, ".env.example");
  writeFileSync(
    examplePath,
    [
      "DATABASE_URL=",
      "BETTER_AUTH_SECRET=",
      "RESEND_API_KEY=",
      "CLOUDFLARE_API_TOKEN=",
      "STRIPE_SECRET_KEY=",
    ].join("\n"),
  );

  const grid = gridFromExample(examplePath, {});
  // Multi-provider rows keyed by real recipe ids — NOT one collapsed 'other'.
  expect(grid.map((r) => r.provider)).toEqual([
    "neon",
    "better-auth",
    "resend",
    "cloudflare",
    "creem",
  ]);
  rmSync(dir, { recursive: true, force: true });
});

test("detectProvider maps known var prefixes to recipe ids", () => {
  expect(detectProvider("DATABASE_URL")).toBe("neon");
  expect(detectProvider("POSTGRES_HOST")).toBe("neon");
  expect(detectProvider("BETTER_AUTH_URL")).toBe("better-auth");
  expect(detectProvider("NEXT_PUBLIC_POSTHOG_KEY")).toBe("posthog");
  expect(detectProvider("CF_API_TOKEN")).toBe("cloudflare");
  expect(detectProvider("DODO_PAYMENTS_API_KEY")).toBe("creem");
  expect(detectProvider("SOME_UNKNOWN_VAR")).toBeUndefined();
});
