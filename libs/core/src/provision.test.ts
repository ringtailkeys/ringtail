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

test("config / non-secret vars classify as skip (BUG: krispyai-cloud dogfood), real keys don't", () => {
  // The exact krispyai-cloud-shaped mix that mis-classified: a URL, product ids, from-addresses,
  // plus the correctly-classified keys that MUST stay intact + an ambiguous var that must NOT skip.
  const plan = planProvision({
    vars: [
      "BETTER_AUTH_URL", //          was mint-from-root — a URL → skip (config)
      "CREEM_PRODUCT_ID_MONTHLY", // was needs-root — a product id → skip (config)
      "CREEM_PRODUCT_ID_ANNUAL", //  was needs-root — a product id → skip (config)
      "EMAIL_FROM", //               was guided-paste — an address → skip (config)
      "LEAD_EMAIL_FROM", //          was guided-paste — an address → skip (config)
      "NEXT_PUBLIC_APP_URL", //      a public URL → skip (config)
      "RESEND_API_KEY", //           a real mintable key → mint-from-root (root connected)
      "BETTER_AUTH_SECRET", //       generate recipe → mint-from-root (local)
      "POSTHOG_API_KEY", //          a real key, no root → needs-root
      "DATABASE_URL", //             a URL BUT a Neon resource → skip (resource, not config)
      "MYSTERY_TOKEN", //            ambiguous → stays guided-paste (never wrongly skipped)
    ],
    roots: [root("resend", "r1")],
  });
  const by = Object.fromEntries(plan.items.map((i) => [i.varName, i.action]));
  const reason = Object.fromEntries(plan.items.map((i) => [i.varName, i.reason]));

  expect(by["BETTER_AUTH_URL"]).toBe("skip");
  expect(by["CREEM_PRODUCT_ID_MONTHLY"]).toBe("skip");
  expect(by["CREEM_PRODUCT_ID_ANNUAL"]).toBe("skip");
  expect(by["EMAIL_FROM"]).toBe("skip");
  expect(by["LEAD_EMAIL_FROM"]).toBe("skip");
  expect(by["NEXT_PUBLIC_APP_URL"]).toBe("skip");

  // The correct existing classifications MUST still hold.
  expect(by["RESEND_API_KEY"]).toBe("mint-from-root");
  expect(by["BETTER_AUTH_SECRET"]).toBe("mint-from-root");
  expect(by["POSTHOG_API_KEY"]).toBe("needs-root");
  expect(by["DATABASE_URL"]).toBe("skip");
  // DATABASE_URL keeps its more specific RESOURCE reason, not the generic config one.
  expect(reason["DATABASE_URL"]).toContain("resource");
  expect(reason["BETTER_AUTH_URL"]).toContain("config value");

  // Conservative bias: an ambiguous unknown var is NOT skipped (skipping a real secret is worse).
  expect(by["MYSTERY_TOKEN"]).toBe("guided-paste");
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

// ── BROWSER MINT classification (Envoyage) — the mint-via-browser upgrade of guided-paste ─────

test("mint-via-browser: a no-recipe var a browser recipe can drive is upgraded ONLY when browser-mode is on", () => {
  // OPENAI_API_KEY has no @ringtail recipe (detectProvider → undefined) but browserRecipes drives
  // openai. Off (default) → it stays guided-paste; local/cloud → mint-via-browser.
  const off = planProvision({ vars: ["OPENAI_API_KEY"], roots: [] });
  expect(off.items[0]?.action).toBe("guided-paste");

  const local = planProvision({ vars: ["OPENAI_API_KEY"], roots: [], browserMode: "local" });
  expect(local.items[0]?.action).toBe("mint-via-browser");
  expect(local.items[0]?.provider).toBe("openai");
  expect(local.items[0]?.reason).toContain("console");

  const cloud = planProvision({ vars: ["OPENAI_API_KEY"], roots: [], browserMode: "cloud" });
  expect(cloud.items[0]?.action).toBe("mint-via-browser");
});

test("mint-via-browser fires ONLY for a var a browser recipe drives; a true unknown stays guided-paste", () => {
  const plan = planProvision({
    vars: ["OPENAI_API_KEY", "SOME_RANDOM_TOKEN"],
    roots: [],
    browserMode: "local",
  });
  const by = Object.fromEntries(plan.items.map((i) => [i.varName, i.action]));
  expect(by["OPENAI_API_KEY"]).toBe("mint-via-browser"); // browser recipe exists
  expect(by["SOME_RANDOM_TOKEN"]).toBe("guided-paste"); // no browser recipe → hand-paste
});

test("browser-mode does NOT touch a var that already has an API recipe (mint-from-root wins)", () => {
  const plan = planProvision({
    vars: ["RESEND_API_KEY"],
    roots: [root("resend", "r1")],
    browserMode: "local",
  });
  expect(plan.items[0]?.action).toBe("mint-from-root"); // API recipe beats the browser fallback
});
