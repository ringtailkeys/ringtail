/**
 * The vendor catalogue (PRD §4.8) — the canonical provider set the "add a connection"
 * autocomplete picks from. The picker emits a CANONICAL lowercase id from this list, never
 * free text — which is the root-cause fix for the "Resend" vs "resend" casing footgun
 * (a provider key mismatched by case minted against the wrong/absent root).
 *
 * SOURCE OF TRUTH: this is the dashboard-side mirror of the engine's registries —
 * @ringtail/recipes RECIPES (resend · posthog · neon · cloudflare · creem · better-auth),
 * @ringtail/core OAUTH_PROVIDERS (github · google · cloudflare · vercel), and
 * DOMAIN_ALLOWLIST. Kept as a static const (not imported) so the browser bundle stays free
 * of core's node:fs/crypto deps; add a row here when a recipe/oauth-provider lands.
 * ponytail: static mirror of a ~10-row registry, sync by hand; wire a codegen step only if
 * the two lists measurably drift.
 *
 * Value-free: ids, labels, categories, tags, logo filenames — nothing secret.
 */

export type VendorCategory =
  | "Email/Comms"
  | "Infra/CDN"
  | "Auth"
  | "Payments"
  | "AI"
  | "Databases"
  | "Storage";

export interface Vendor {
  /** The canonical lowercase provider id — the ONLY thing the picker emits. */
  id: string;
  /** Human-facing display name. */
  label: string;
  category: VendorCategory;
  /** Free-text search tags (also matched by the filter). */
  tags: string[];
  /** True when the provider is in OAUTH_PROVIDERS → the "Connect" (OAuth) mode applies. */
  oauth: boolean;
}

/** The canonical set — union of RECIPES + OAUTH_PROVIDERS (see file header). */
export const VENDORS: Vendor[] = [
  { id: "resend", label: "Resend", category: "Email/Comms", tags: ["email", "smtp"], oauth: false },
  {
    id: "cloudflare",
    label: "Cloudflare",
    category: "Infra/CDN",
    tags: ["cdn", "dns", "workers"],
    oauth: true,
  },
  {
    id: "vercel",
    label: "Vercel",
    category: "Infra/CDN",
    tags: ["hosting", "deploy"],
    oauth: true,
  },
  {
    id: "github",
    label: "GitHub",
    category: "Infra/CDN",
    tags: ["git", "repo", "ci"],
    oauth: true,
  },
  {
    id: "google",
    label: "Google Cloud",
    category: "Infra/CDN",
    tags: ["gcp", "cloud"],
    oauth: true,
  },
  {
    id: "better-auth",
    label: "Better Auth",
    category: "Auth",
    tags: ["auth", "session"],
    oauth: false,
  },
  {
    id: "infisical",
    label: "Infisical",
    category: "Auth",
    tags: ["secrets", "vault"],
    oauth: false,
  },
  {
    id: "creem",
    label: "Creem",
    category: "Payments",
    tags: ["billing", "payments"],
    oauth: false,
  },
  {
    id: "posthog",
    label: "PostHog",
    category: "AI",
    tags: ["analytics", "llm", "observability"],
    oauth: false,
  },
  {
    id: "neon",
    label: "Neon",
    category: "Databases",
    tags: ["postgres", "database", "sql"],
    oauth: false,
  },
];

/** The display order of categories (empty ones are simply skipped by groupVendors). */
export const VENDOR_CATEGORIES: VendorCategory[] = [
  "Email/Comms",
  "Infra/CDN",
  "Auth",
  "Payments",
  "AI",
  "Databases",
  "Storage",
];

/** Case-insensitive substring match over id · label · tags. Empty query → all. */
export function filterVendors(vendors: Vendor[], query: string): Vendor[] {
  const q = query.trim().toLowerCase();
  if (!q) return vendors;
  return vendors.filter(
    (v) =>
      v.id.includes(q) || v.label.toLowerCase().includes(q) || v.tags.some((t) => t.includes(q)),
  );
}

/** Group vendors by category in VENDOR_CATEGORIES order, dropping empty categories. */
export function groupVendors(
  vendors: Vendor[],
): Array<{ category: VendorCategory; vendors: Vendor[] }> {
  return VENDOR_CATEGORIES.map((category) => ({
    category,
    vendors: vendors.filter((v) => v.category === category),
  })).filter((g) => g.vendors.length > 0);
}

/** Resolve a canonical vendor by id (case-insensitive) — null for an unknown id. */
export function findVendor(id: string): Vendor | null {
  const key = id.trim().toLowerCase();
  return VENDORS.find((v) => v.id === key) ?? null;
}
