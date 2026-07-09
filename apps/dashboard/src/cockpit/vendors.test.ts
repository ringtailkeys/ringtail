import { expect, test } from "bun:test";
import { VENDORS, filterVendors, findVendor, groupVendors } from "./vendors";

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
