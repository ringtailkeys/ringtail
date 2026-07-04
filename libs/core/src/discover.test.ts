// Local credential discovery: reuse a complete root grant from a known store, seed
// the grid as already-connected, and NEVER surface a value.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStore } from "@ringtail/store";
import { reuseKnownCredentials } from "./index";

let dir: string;
let envLocalPath: string;
const CF_TOKEN = "cf-DISCOVERED-TOKEN-DO-NOT-LEAK";
const NEON_KEY = "neon-DISCOVERED-KEY-DO-NOT-LEAK";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-discover-"));
  envLocalPath = join(dir, ".env.local");
  // A known store: the project .env.local already holds two providers' root creds.
  writeFileSync(
    envLocalPath,
    [`CLOUDFLARE_API_TOKEN=${CF_TOKEN}`, `NEON_API_KEY=${NEON_KEY}`].join("\n"),
  );
  process.env.RINGTAIL_HOME = join(dir, "home"); // throwaway store
  // Determinism: clear any real env vars that would out-prioritise .env.local.
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.NEON_API_KEY;
  delete process.env.RESEND_API_KEY;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("reuses a complete root grant found in .env.local, names + source only", () => {
  const reused = reuseKnownCredentials({ envLocalPath });
  const byProvider = Object.fromEntries(reused.map((r) => [r.provider, r]));

  // cloudflare (root: CLOUDFLARE_API_TOKEN) and neon (root: NEON_API_KEY) are reused.
  expect(byProvider.cloudflare?.reused.map((x) => x.key)).toEqual(["CLOUDFLARE_API_TOKEN"]);
  expect(byProvider.neon?.reused.map((x) => x.key)).toEqual(["NEON_API_KEY"]);
  expect(byProvider.cloudflare?.reused[0]?.source).toBe(".env.local");

  // Generate-only recipe (no root cred to find) is never "reused".
  expect(byProvider["better-auth"]).toBeUndefined();

  // The report is names + provenance ONLY — no discovered value ever appears.
  const blob = JSON.stringify(reused);
  expect(blob).not.toContain(CF_TOKEN);
  expect(blob).not.toContain(NEON_KEY);

  // But the value WAS copied into the store for reuse (cross-repo / downstream).
  const store = readStore();
  expect(store.credentials.CLOUDFLARE_API_TOKEN?.value).toBe(CF_TOKEN);
  expect(store.credentials.NEON_API_KEY?.value).toBe(NEON_KEY);
});

test("a provider whose root grant is absent is not reused", () => {
  // resend's root (RESEND_API_KEY) isn't in any known store here.
  const reused = reuseKnownCredentials({ envLocalPath });
  expect(reused.some((r) => r.provider === "resend")).toBe(false);
});
