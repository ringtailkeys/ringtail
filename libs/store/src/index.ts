import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * @ringtail/store — root credential store at ~/.ringtail/credentials.json.
 * ~/.aws-style: a root cred (a Cloudflare token, a Neon key) is the SAME no
 * matter which repo you're setting up, so it lives ONCE here and every run
 * across every repo reuses it. Per-repo values go to that repo's .env.local.
 *
 * Dir is 0700, file is 0600 — enforced via chmod on every write (a fresh
 * umask can't loosen it). This is a trust boundary: secrets on disk.
 *
 * `RINGTAIL_HOME` overrides the root dir (à la ~/.aws vs AWS_CONFIG_FILE) — the
 * test seam that lets the e2e point the store at a throwaway temp dir. Paths are
 * computed per-call (not module constants) so the override applies at call time.
 */
// Local credential discovery — scan KNOWN stores, map to manifest vars, reuse.
export { discoverCredentials, type DiscoveredCred } from "./discover";

export interface Credential {
  value: string;
  provider: string;
  /** ISO-8601 timestamp of the last write. */
  updatedAt: string;
}

/** A per-account ROOT credential — the master key that MINTS other keys. Lives in
 * the GLOBAL vault (not per-repo), keyed by `provider` or `provider:account`
 * (agency multi-account). NEVER returned by any endpoint/tool — the daemon only
 * ever substitutes it into an outbound call toward an allowlisted provider host. */
export interface RootCredential {
  value: string;
  /** ISO-8601 timestamp of the last write. */
  updatedAt: string;
}

/**
 * An OAuth grant — the tokens Ringtail obtained on the user's behalf via the loopback
 * PKCE "Connect a provider" flow (PRD §4.9). An access/refresh token IS a secret value,
 * so it lives in the SAME 0600 vault as a pasted root and is NEVER returned to any
 * agent-facing surface. Keyed by `provider` (github/google/…). The daemon substitutes
 * `accessToken` into an outbound call to an allowlisted host exactly like a pasted root;
 * only NAMES + scopes + expiry are ever surfaced (listConnectedProviders).
 */
export interface Grant {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  /** Unix ms the access token expires, or undefined for non-expiring tokens (e.g. GitHub). */
  expiresAt?: number;
  /** Unix ms the grant was obtained/last-refreshed. */
  obtainedAt: number;
}

/** The signed-in control-plane session (Better Auth). The daemon holds this privately
 * and sends it ONLY to the control-plane (entitlement/usage/checkout) — it is NEVER
 * surfaced to the agent or the dashboard (only the email/tier are). Persisted so a
 * reinstall of the daemon keeps you signed in; the free limit is server-side regardless. */
export interface Session {
  token: string;
  email: string;
}

export interface Store {
  /** Keyed by env-var name (e.g. CLOUDFLARE_API_TOKEN). */
  credentials: Record<string, Credential>;
  /** The global root-key vault, keyed by `provider`(+`:account`). Optional so an
   * existing store without it reads clean. */
  roots?: Record<string, RootCredential>;
  /** OAuth grants, keyed by `provider`. Optional so an older store reads clean. */
  grants?: Record<string, Grant>;
  /** The control-plane session (account sign-in). Optional so an older store reads clean. */
  session?: Session;
}

/** Root config dir. `RINGTAIL_HOME` overrides; default ~/.ringtail. */
export function getConfigDir(): string {
  return process.env.RINGTAIL_HOME || join(homedir(), ".ringtail");
}

function credentialsPath(): string {
  return join(getConfigDir(), "credentials.json");
}

export function readStore(): Store {
  const file = credentialsPath();
  if (!existsSync(file)) return { credentials: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Store>;
    return {
      credentials: parsed.credentials ?? {},
      roots: parsed.roots ?? {},
      grants: parsed.grants ?? {},
      ...(parsed.session ? { session: parsed.session } : {}),
    };
  } catch {
    // ponytail: corrupt/hand-edited file → treat as empty rather than crash;
    // the next write rewrites it clean. Upgrade path: back up + warn if this
    // ever eats real creds in practice.
    return { credentials: {} };
  }
}

export function writeStore(store: Store): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700); // mkdir mode is umask-masked; chmod is not.
  const file = credentialsPath();
  writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** Convenience upsert: read → set one credential → write, preserving 0600. */
export function putCredential(key: string, cred: Credential): void {
  const store = readStore();
  store.credentials[key] = cred;
  writeStore(store);
}

// ── the global root-key vault (per-account master keys that MINT other keys) ──

/** Vault key normalization: provider segment is case-insensitive (allowlist keys are
 * lowercase); the optional :account suffix is preserved. A root pasted under "Resend"
 * then resolves for a "resend" mint. */
function normRootKey(providerAccount: string): string {
  const [provider, ...account] = providerAccount.split(":");
  return [(provider ?? providerAccount).toLowerCase(), ...account].join(":");
}

/**
 * Store a root key for `providerAccount` (`resend`, or `resend:client-x` for a
 * multi-account agency). The GLOBAL vault — written once, reused across every repo
 * and env. Same 0600 file as the credentials. The value NEVER leaves the daemon
 * except substituted into an outbound call to an allowlisted provider host.
 */
export function putRoot(providerAccount: string, value: string): void {
  const store = readStore();
  store.roots ??= {};
  store.roots[normRootKey(providerAccount)] = { value, updatedAt: new Date().toISOString() };
  writeStore(store);
}

/** Resolve a root key VALUE for `providerAccount`, or null if we don't hold one.
 * Daemon-internal: callers substitute it into an allowlisted call, never surface it. */
export function resolveRoot(providerAccount: string): string | null {
  return readStore().roots?.[normRootKey(providerAccount)]?.value ?? null;
}

/** The provider(+account) NAMES we hold a root key for — names only, never a value.
 * Safe to surface (dashboard "which roots are set"). */
export function listRootAccounts(): string[] {
  return Object.keys(readStore().roots ?? {});
}

// ── the OAuth grant vault (tokens from the loopback PKCE connect flow) ───────

/** A value-free view of a connected provider — NAMES + scopes + expiry only, NEVER
 * a token. This is the ONLY grant shape that may cross an agent/dashboard surface. */
export interface ConnectedProvider {
  provider: string;
  scopes: string[];
  expiresAt?: number;
  obtainedAt: number;
}

/**
 * Store an OAuth grant for `provider` (github/google/…). The GLOBAL vault, same 0600
 * file as the roots. The tokens NEVER leave the daemon except substituted into an
 * outbound call to an allowlisted provider host (mirrors putRoot). Provider is lowercased.
 */
export function putGrant(provider: string, grant: Grant): void {
  const store = readStore();
  store.grants ??= {};
  store.grants[provider.toLowerCase()] = { ...grant, provider: provider.toLowerCase() };
  writeStore(store);
}

/** The raw grant for `provider` (tokens included) or null. Daemon-INTERNAL only —
 * callers substitute `accessToken` into an allowlisted call, never surface it. */
export function getGrant(provider: string): Grant | null {
  return readStore().grants?.[provider.toLowerCase()] ?? null;
}

/** The connected providers — NAMES + scopes + expiry, NEVER a token. Safe to surface
 * (dashboard "which providers are connected", the agent-guided status). */
export function listConnectedProviders(): ConnectedProvider[] {
  return Object.values(readStore().grants ?? {}).map(
    ({ provider, scopes, expiresAt, obtainedAt }) => ({
      provider,
      scopes,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      obtainedAt,
    }),
  );
}

// ── the control-plane session (account sign-in; daemon-private) ──────────────

/** Persist the signed-in control-plane session (same 0600 file). */
export function putSession(session: Session): void {
  const store = readStore();
  store.session = session;
  writeStore(store);
}

/** The stored session, or null if signed out. Daemon-internal — the token is only
 * ever sent to the control-plane, never surfaced to the agent/dashboard. */
export function getSession(): Session | null {
  return readStore().session ?? null;
}

/** Sign out: drop the stored session. The account's server-side usage is untouched. */
export function clearSession(): void {
  const store = readStore();
  delete store.session;
  writeStore(store);
}

/**
 * The cross-repo reuse gate: do we already hold EVERY one of these root keys?
 * Returns the stored values keyed by env-var name iff all are present, else null
 * (the signal to acquire them). Empty `keys` → {} (nothing required). Never
 * returns partial creds — a half-stored provider must re-acquire.
 */
export function resolveRootCreds(keys: string[]): Record<string, string> | null {
  const store = readStore();
  const out: Record<string, string> = {};
  for (const k of keys) {
    const cred = store.credentials[k];
    if (!cred) return null;
    out[k] = cred.value;
  }
  return out;
}
