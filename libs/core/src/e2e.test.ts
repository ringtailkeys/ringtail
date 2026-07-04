// Full-flow, offline, deterministic e2e. Runs the entire credential lifecycle
// against the in-process mock provider + fake Infisical — no cloud accounts, no
// network beyond localhost, identical output every run.
//
//   scan .env.example → all missing → consent → mint → validate-after-mint
//   → (assert wrong-scope caught) → provision → sync → assert real .env.local
//   → assert Infisical called per-env → assert synced across dev/staging/prod
//   → run 2× → assert byte-identical (idempotent)
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPlan, provisionCredential, type Environment } from "./index";
import { startMockProvider, type MockProvider } from "./mock-provider";

const ENVS: Environment[] = ["dev", "staging", "prod"];

// A fixture manifest — the "shopping list" the scan reads.
const FIXTURE_ENV_EXAMPLE = ["# ── Mock Provider ──", "MOCK_API_KEY=", "MOCK_RESOURCE_ID="].join(
  "\n",
);

let dir: string;
let examplePath: string;
let envLocalPath: string;
let mock: MockProvider;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-e2e-"));
  examplePath = join(dir, ".env.example");
  envLocalPath = join(dir, ".env.local");
  writeFileSync(examplePath, FIXTURE_ENV_EXAMPLE);

  mock = startMockProvider();
  // Route the recipe + the Infisical sink at the fake, with machine-identity creds.
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.MOCK_PROVIDER_URL = mock.url;
  process.env.INFISICAL_API_URL = mock.url;
  process.env.INFISICAL_CLIENT_ID = "mock-client-id";
  process.env.INFISICAL_CLIENT_SECRET = "mock-client-secret";
  process.env.INFISICAL_PROJECT_ID = "mock-project";
});

afterAll(() => {
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("scan: every manifest var starts missing (nothing provisioned yet)", () => {
  const plan = readPlan(examplePath, {}); // empty live env → all missing
  expect(plan.map((e) => e.key)).toEqual(["MOCK_API_KEY", "MOCK_RESOURCE_ID"]);
  expect(plan.every((e) => e.present === false)).toBe(true);
  expect(plan[0]?.section).toBe("Mock Provider");
});

test("validate-AFTER-mint catches + flags a wrong-scope token (no provision, no sync)", async () => {
  const before = mock.calls.infisical.length;
  const report = await provisionCredential("mock-badscope", {
    env: "dev",
    repoName: "ringtail",
    envLocalPath,
  });

  expect(report.status).toBe("wrong-scope");
  expect(report.missing).toContain("write"); // the granted token only carried [read]
  expect(report.scopes).toEqual(["read"]);
  expect(report.keys).toEqual([]); // nothing synced
  expect(report.trail).toEqual(["needs-consent", "validating", "wrong-scope"]);
  // Short-circuited before sync → no new Infisical traffic.
  expect(mock.calls.infisical.length).toBe(before);
});

test("failed action: a rate-limited provision is caught + flagged `failed` (no sync), with a plain-language reason", async () => {
  const before = mock.calls.infisical.length;
  const report = await provisionCredential("mock-failprovision", {
    env: "dev",
    repoName: "ringtail",
    envLocalPath,
  });

  // Validate passed (full-scope token), but the provision API call rate-limited.
  expect(report.status).toBe("failed");
  expect(report.scopes).toEqual(["read", "write"]);
  expect(report.reason).toContain("rate limited"); // provider's plain-language cause
  expect(report.keys).toEqual([]); // nothing synced
  expect(report.trail).toEqual([
    "needs-consent",
    "validating",
    "validated",
    "provisioning",
    "failed",
  ]);
  // Failed before sync → no new Infisical traffic.
  expect(mock.calls.infisical.length).toBe(before);
  // The reason must never carry a secret VALUE (defense-in-depth).
  expect(report.reason ?? "").not.toContain("mock-token");
});

// The good path, as a re-runnable unit so we can prove idempotency.
async function runGoodPath(): Promise<{ envLocal: string; statuses: string[] }> {
  const statuses: string[] = [];
  for (const env of ENVS) {
    const report = await provisionCredential("mock", {
      env,
      repoName: "ringtail",
      envLocalPath,
    });
    statuses.push(report.status);
    expect(report.status).toBe("synced");
    expect(report.scopes).toEqual(["read", "write"]);
    expect(report.missing).toEqual([]);
    expect(report.keys.sort()).toEqual(["MOCK_API_KEY", "MOCK_RESOURCE_ID"]);
    expect(report.trail).toEqual([
      "needs-consent",
      "validating",
      "validated",
      "provisioning",
      "synced",
    ]);
    // dev writes the local file; staging/prod are Infisical-only.
    expect(report.wroteLocal).toBe(env === "dev");
  }
  return { envLocal: readFileSync(envLocalPath, "utf8"), statuses };
}

test("full loop: provision + sync across dev/staging/prod, real .env.local, Infisical per-env", async () => {
  mock.calls.infisical.length = 0; // fresh recorder for this assertion
  const first = await runGoodPath();

  // Real .env.local was written with the expected keys (dev only).
  expect(first.envLocal).toContain("MOCK_API_KEY=mock-token-full");
  expect(first.envLocal).toContain("MOCK_RESOURCE_ID=mock-res-ringtail");

  // Final status synced across all three environments.
  expect(first.statuses).toEqual(["synced", "synced", "synced"]);

  // Infisical sink called for EVERY environment.
  const envsHit = new Set(mock.calls.infisical.map((c) => c.env));
  expect([...envsHit].sort()).toEqual(["dev", "prod", "staging"]);

  // Never a secret VALUE in any report/status field (defense-in-depth).
  const reportBlob = JSON.stringify(first.statuses);
  expect(reportBlob).not.toContain("mock-token-full");
});

test("idempotent: a second identical run produces a byte-identical .env.local", async () => {
  const first = readFileSync(envLocalPath, "utf8");
  const second = await runGoodPath();
  expect(second.envLocal).toBe(first); // no drift, no duplicate lines
  expect(second.statuses).toEqual(["synced", "synced", "synced"]);
});
