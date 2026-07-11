import { expect, test } from "bun:test";
import {
  VENDORS,
  customVendor,
  defaultVarName,
  filterVendors,
  findVendor,
  groupVendors,
  slugify,
} from "./vendors";

test("filter matches id, label, and tags (case-insensitive)", () => {
  expect(filterVendors(VENDORS, "Resend").map((v) => v.id)).toEqual(["resend"]);
  expect(filterVendors(VENDORS, "postgres").map((v) => v.id)).toEqual(["neon"]); // tag match
  expect(filterVendors(VENDORS, "GIT").map((v) => v.id)).toContain("github"); // tag "git"
});

test("empty query returns the whole catalogue", () => {
  expect(filterVendors(VENDORS, "   ")).toHaveLength(VENDORS.length);
});

test("group drops empty categories and keeps declared order", () => {
  const groups = groupVendors(VENDORS);
  expect(groups.map((g) => g.category)).toEqual([
    "Email/Comms",
    "Infra/CDN",
    "Auth",
    "Payments",
    "AI",
    "Databases",
  ]); // "Storage" has no vendors → dropped
});

test("findVendor canonicalises case → the casing footgun fix", () => {
  expect(findVendor("Resend")?.id).toBe("resend");
  expect(findVendor("  CLOUDFLARE ")?.id).toBe("cloudflare");
  expect(findVendor("not-a-vendor")).toBeNull();
});

test("oauth flag is set for the OAUTH_PROVIDERS members only", () => {
  expect(findVendor("github")?.oauth).toBe(true);
  expect(findVendor("resend")?.oauth).toBe(false);
});

test("infisical is flagged a SINK (written to, not minted from)", () => {
  expect(findVendor("infisical")?.sink).toBe(true);
  expect(findVendor("resend")?.sink).toBeUndefined();
});

test("slugify collapses a free-typed name to a canonical id", () => {
  expect(slugify("Dodo Payment")).toBe("dodo-payment");
  expect(slugify("  Acme.Co!! ")).toBe("acme-co");
  expect(slugify("   ")).toBe("");
});

test("defaultVarName derives a sensible env var", () => {
  expect(defaultVarName("dodo-payment")).toBe("DODO_PAYMENT_API_KEY");
});

test("customVendor routes an unknown query to a paste-only, no-recipe entry (the Dodo case)", () => {
  const v = customVendor("Dodo Payment");
  expect(v).not.toBeNull();
  expect(v?.id).toBe("dodo-payment");
  expect(v?.label).toBe("Dodo Payment"); // keeps the user's casing
  expect(v?.custom).toBe(true);
  expect(v?.oauth).toBe(false); // NO minting/OAuth for an unknown vendor
  expect(v?.defaultVar).toBe("DODO_PAYMENT_API_KEY");
  expect(findVendor("dodo-payment")).toBeNull(); // never enters the canonical set
});

test("customVendor is null for a blank query (nothing to make a vendor from)", () => {
  expect(customVendor("   ")).toBeNull();
});
