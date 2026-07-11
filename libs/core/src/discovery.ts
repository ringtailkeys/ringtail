/**
 * The DISCOVERY registry — the config that turns a one-shot, over-privileged mint into
 * a GUIDED, least-privilege one (PRD §4.5). Before a consequential mint, the daemon runs
 * an allowlisted READ-ONLY GET with the root/grant to enumerate the provider's real
 * resources + the permission options the human will choose from. This is DATA, not
 * per-call-site code: one `DiscoverySpec` row per provider, exactly like DOMAIN_ALLOWLIST
 * and OAUTH_PROVIDERS.
 *
 * THE GUARANTEE holds: discovery reads resource NAMES/ids and permission LABELS only —
 * never a secret value. The root/grant is substituted into the outbound GET exactly like
 * a mint ({{ROOT}} → the daemon's stored key) and leaves the daemon ONLY toward the
 * allowlisted host; the response is parsed for `idField`/`nameField` and nothing else.
 */

/** A read-only spec for enumerating one provider's scopable resources + permission menu. */
export interface DiscoverySpec {
  /** The allowlisted read-only GET that lists the resources (e.g. Resend GET /domains). */
  url: string;
  /** Header carrying the root/grant. `{{ROOT}}` is substituted with the stored key. */
  headers: Record<string, string>;
  /** Dot-path to the resource ARRAY in the JSON response (Resend `data`, Cloudflare `result`). */
  listPath: string;
  /** Field on each item → the id substituted into the mint's `{{RESOURCE}}` placeholder. */
  idField: string;
  /** Field on each item → the human-readable name shown in the dashboard choice. */
  nameField: string;
  /** The least-privilege permission menu, NARROWEST FIRST — [0] is the SUGGESTED default. */
  permissions: string[];
  /** Whether the provider's mint accepts an expiry (drives the optional expiry choice). */
  supportsExpiry: boolean;
}

import type { RootInfo } from "@ringtail/store";

/** A value-free discovered resource — id + name only, NEVER a secret. */
export interface DiscoveredResource {
  id: string;
  name: string;
}

/**
 * The value-free menu the human steers with — resource NAMES/ids + the permission options
 * + whether expiry applies + the narrowest (suggested) permission. Rides the SSE snapshot
 * on `PendingMint.choices`; carries no secret value.
 */
export interface MintChoices {
  resources: DiscoveredResource[];
  permissions: string[];
  /** The narrowest permission (permissions[0]) — the agent suggests, the human confirms/edits. */
  suggestedPermission: string;
  supportsExpiry: boolean;
  /**
   * MULTI-ROOT (PRD §4.4): present ONLY when the provider holds >1 root — the value-free
   * roots the human picks WHICH to spend (labels/accounts/ids, NEVER a value). When set, the
   * human's `selection.rootId` MUST be one of these ids; resource discovery is then run
   * against the CHOSEN root at approve time. A single-root provider omits this (no regression).
   */
  roots?: RootInfo[];
}

/** The human's steered selection, posted back with the approval nonce. Intent only. */
export interface MintSelection {
  /** The chosen resource id (must be one of the discovered ids). */
  resource: string;
  /** The chosen least-privilege permission (must be one of the spec's options). */
  permission: string;
  /** Optional expiry (only honored when the spec supportsExpiry). ISO date or provider units. */
  expiry?: string;
  /**
   * MULTI-ROOT (PRD §4.4): the chosen root's id — REQUIRED when the parked choice offered
   * `roots` (>1 root). Must be one of the enumerated ids, so a compromised dashboard cannot
   * inject an arbitrary root; the daemon resolves the value by this id, never trusts a value.
   */
  rootId?: string;
}

/**
 * The seeded specs. `resend` + `mock` fit the generic shape exactly (a flat `permission`
 * string on a create-token body). `cloudflare` fits for RESOURCE discovery (zones) but its
 * permission model is a policies array of permission-group ids, NOT a flat string — see the
 * per-row note; the agent's mint-body template must carry that structure, the placeholder
 * only substitutes the chosen value into it.
 */
export const DISCOVERY_SPECS: Record<string, DiscoverySpec> = {
  resend: {
    url: "https://api.resend.com/domains",
    headers: { Authorization: "Bearer {{ROOT}}" },
    listPath: "data",
    idField: "id",
    nameField: "name",
    // Resend API-key permissions (verified 2026-07): sending_access is the least-privilege
    // default; full_access is the broad option. `domain_id` scopes a sending_access key to
    // one domain. No expiry on Resend keys.
    permissions: ["sending_access", "full_access"],
    supportsExpiry: false,
  },
  cloudflare: {
    // Cloudflare: GET /zones enumerates zones cleanly (RESOURCE discovery fits the shape).
    url: "https://api.cloudflare.com/client/v4/zones",
    headers: { Authorization: "Bearer {{ROOT}}" },
    listPath: "result",
    idField: "id",
    nameField: "name",
    // FLAG (§4.5 fit): Cloudflare's real permission model is a policies[] array of
    // permission-GROUP ids scoped to resources — NOT a flat string. These labels are the
    // human-facing menu; the agent must author the mint body as the policies structure and
    // let {{PERMISSION}} substitute the chosen group id. The generic flat-placeholder shape
    // covers resource choice + a single scalar; a full Cloudflare policy needs the agent's
    // template to carry the array. Documented, not silently mis-modeled.
    permissions: ["Zone:DNS:Edit", "Zone:Read"],
    supportsExpiry: true,
  },
  godaddy: {
    // GoDaddy: GET /v1/domains returns a BARE array of { domain, domainId, status } (no envelope),
    // so `listPath: ""` means "the body IS the array" (runDiscovery special-cases it). The `domain`
    // NAME is the id the set-nameservers PUT targets (`/v1/domains/{domain}`), so idField = domain.
    // TODO(verify): confirm the exact 2026 `GET /v1/domains` response shape + field names.
    url: "https://api.godaddy.com/v1/domains",
    // GoDaddy auth is `sso-key {API_KEY}:{API_SECRET}` — the connected root is the COMBINED
    // `KEY:SECRET` string; {{ROOT}} substitutes it whole. TODO(verify): the exact combined format.
    headers: { Authorization: "sso-key {{ROOT}}" },
    listPath: "",
    idField: "domain",
    nameField: "domain",
    // GoDaddy API keys are NOT least-privilege-scopable per resource like a Resend/CF token — the
    // domain-level action (set-nameservers) is the unit, so the "permission" menu is nominal.
    permissions: ["nameserver-update"],
    supportsExpiry: false,
  },
};

/**
 * Resolve a provider's discovery spec. `mock`'s url comes from env at CALL TIME (the test
 * mock binds an ephemeral loopback port), so it can't be a static row — mirrors
 * getOAuthProvider. Returns null when the provider has no discovery spec (the caller then
 * rejects a `discover` request value-free rather than minting an unscoped/placeholder body).
 */
export function getDiscoverySpec(provider: string): DiscoverySpec | null {
  const key = provider.toLowerCase();
  if (key === "mock") {
    const url = process.env.RINGTAIL_DISCOVERY_MOCK_URL;
    if (!url) return null;
    return {
      url,
      headers: { Authorization: "Bearer {{ROOT}}" },
      listPath: "data",
      idField: "id",
      nameField: "name",
      permissions: ["sending_access", "full_access"],
      supportsExpiry: true,
    };
  }
  return DISCOVERY_SPECS[key] ?? null;
}
