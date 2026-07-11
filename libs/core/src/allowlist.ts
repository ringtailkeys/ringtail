/**
 * The domain allowlist — THE structural floor of the trust model (PRD §"Security
 * posture", architecture.md §"THE GUARANTEE"). A root key can ONLY be sent to that
 * provider's own vetted host. The agent proposes actions but can never redirect a
 * root key to an arbitrary URL, so exfiltration is impossible regardless of what the
 * agent authors. This is DATA, not code: a new provider is one row, never a recipe.
 *
 * Keyed by provider (the part of `providerAccount` before any `:account` suffix).
 * Host match is exact-hostname (port/path ignored) — a token bound to `resend`
 * reaches `api.resend.com` and nothing else.
 */
export const DOMAIN_ALLOWLIST: Record<string, string[]> = {
  resend: ["api.resend.com"],
  posthog: ["us.posthog.com", "app.posthog.com"],
  neon: ["console.neon.tech"],
  cloudflare: ["api.cloudflare.com"],
  creem: ["api.creem.io"],
  // GoDaddy: list domains + set-nameservers (point a domain at Cloudflare's NS). One host.
  godaddy: ["api.godaddy.com"],
  // OAuth-grant providers (PRD §4.9): the vetted host a grant's access token may reach.
  github: ["api.github.com"],
  // TODO(verify): Google APIs span many *.googleapis.com subdomains (exact-hostname
  // match) — add the exact API host you provision against; www.googleapis.com covers
  // the legacy/discovery + API-Keys surface. Widen deliberately, never to a wildcard.
  google: ["www.googleapis.com", "cloudresourcemanager.googleapis.com", "apikeys.googleapis.com"],
  vercel: ["api.vercel.com"],
  // better-auth mints locally (no external API) — no host may carry its secret.
  "better-auth": [],
  // The offline mock provider is just another allowlisted host: it binds loopback
  // on an ephemeral port, so we allow the hostname (port is ignored in the check).
  mock: ["localhost", "127.0.0.1"],
};

/** The provider part of a `provider` or `provider:account` key. */
export function providerOf(providerAccount: string): string {
  return providerAccount.split(":")[0] ?? providerAccount;
}

/**
 * Is `url` an allowlisted host for `providerAccount`? False if the provider is
 * unknown, has no allowed hosts, or the URL's hostname isn't on its list — or if
 * `url` doesn't parse. This is the gate the executor runs BEFORE resolving a root
 * key or making any HTTP call: a non-allowlisted host is rejected, never reached.
 */
export function hostAllowed(providerAccount: string, url: string): boolean {
  const provider = providerOf(providerAccount).toLowerCase();
  // The `mock` row points at loopback (localhost/127.0.0.1) — in a real build that is
  // an SSRF surface: a coding agent runs on the SAME machine, so it can BE a loopback
  // listener and read the root off its own inbound request, or hit any local service
  // (adminer, redis, the daemon itself). Ship it OFF; only the test harness opts in via
  // RINGTAIL_ALLOW_MOCK=1. Never present in a production run.
  if (provider === "mock" && process.env.RINGTAIL_ALLOW_MOCK !== "1") return false;
  const allowed = DOMAIN_ALLOWLIST[provider];
  if (!allowed || allowed.length === 0) return false;
  try {
    return allowed.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The host part of a URL for a value-free rejection reason (never leaks anything). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable url)";
  }
}
