// Unit: the batch planner's classification (mint-from-root / needs-root / guided-paste / skip)
// over a mock `.env.example` var mix. Pure — no daemon, no network. Roots/grants are handed in
// (the daemon fetches them from the store), so this pins the DECISION rules in isolation.
import { expect, test } from "bun:test";
import type { ConnectedProvider, RootInfo } from "@ringtail/store";
import { getDiscoverySpec } from "./discovery";
import { planProvision, type ProvisionAction } from "./provision";

const root = (provider: string, id: string): RootInfo => ({ id, provider, createdAt: 0 });
const grant = (provider: string): ConnectedProvider => ({ provider, scopes: [], obtainedAt: 0 });

// A realistic mixed manifest: two connected providers (root each), one connected-but-not,
// a local-generate secret, two resource vars, and an unknown key.
const VARS = [
  "RESEND_API_KEY", //         resend recipe + a connected resend root → mint-from-root
  "CLOUDFLARE_API_TOKEN", //   cloudflare recipe + a connected CF root  → mint-from-root
  "CLOUDFLARE_ACCOUNT_ID", //  cloudflare recipe, resource (not a root key) → skip
  "DATABASE_URL", //           neon recipe, provisioned resource         → skip
  "NEON_API_KEY", //           neon recipe, NO neon root connected        → needs-root
  "BETTER_AUTH_SECRET", //     generate recipe (mints locally, no root)   → mint-from-root
  "GODADDY_API_KEY", //        godaddy recipe, NO godaddy root            → needs-root
  "SOME_RANDOM_TOKEN", //      no recipe                                  → guided-paste
];

function classify(): Record<string, ProvisionAction> {
  const plan = planProvision({
    vars: VARS,
    roots: [root("resend", "r1"), root("cloudflare", "c1")],
    grants: [],
    project: "acme",
  });
  return Object.fromEntries(plan.items.map((i) => [i.varName, i.action]));
}

test("planner classifies each var into the right bucket", () => {
  const by = classify();
  expect(by["RESEND_API_KEY"]).toBe("mint-from-root");
  expect(by["CLOUDFLARE_API_TOKEN"]).toBe("mint-from-root");
  expect(by["CLOUDFLARE_ACCOUNT_ID"]).toBe("skip");
  expect(by["DATABASE_URL"]).toBe("skip");
  expect(by["NEON_API_KEY"]).toBe("needs-root");
  expect(by["BETTER_AUTH_SECRET"]).toBe("mint-from-root"); // generate → minted locally, no root
  expect(by["GODADDY_API_KEY"]).toBe("needs-root");
  expect(by["SOME_RANDOM_TOKEN"]).toBe("guided-paste");
});

test("mint-from-root names the single connected root's id (the one the batch spends)", () => {
  const plan = planProvision({ vars: ["RESEND_API_KEY"], roots: [root("resend", "r1")] });
  expect(plan.items[0]?.action).toBe("mint-from-root");
  expect(plan.items[0]?.rootId).toBe("r1");
});

test("a provider with >1 root is mint-from-root but names NO rootId (the human picks)", () => {
  const plan = planProvision({
    vars: ["RESEND_API_KEY"],
    roots: [root("resend", "r1"), root("resend", "r2")],
  });
  expect(plan.items[0]?.action).toBe("mint-from-root");
  expect(plan.items[0]?.rootId).toBeUndefined();
});

test("an OAuth grant (no pasted root) also satisfies mint-from-root", () => {
  const plan = planProvision({ vars: ["RESEND_API_KEY"], roots: [], grants: [grant("resend")] });
  expect(plan.items[0]?.action).toBe("mint-from-root");
});

test("every item carries a plain-language reason + its provider (value-free)", () => {
  const plan = planProvision({ vars: VARS, roots: [root("resend", "r1")], project: "acme" });
  expect(plan.project).toBe("acme");
  expect(plan.items.length).toBe(VARS.length);
  expect(plan.items.every((i) => typeof i.reason === "string" && i.reason.length > 0)).toBe(true);
});

test("GoDaddy discover: the domain-list spec has the right shape (bare-array response)", () => {
  const spec = getDiscoverySpec("godaddy");
  expect(spec).not.toBeNull();
  expect(spec!.url).toBe("https://api.godaddy.com/v1/domains");
  // GoDaddy auth is `sso-key {{ROOT}}` (the combined KEY:SECRET), not Bearer.
  expect(spec!.headers.Authorization).toBe("sso-key {{ROOT}}");
  // `listPath: ""` = the body IS the array (no `{ data: [...] }` envelope).
  expect(spec!.listPath).toBe("");
  expect(spec!.idField).toBe("domain");
  expect(spec!.nameField).toBe("domain");
});
