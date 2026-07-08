import { randomBytes } from "node:crypto";
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
  /** The PROVIDER-side key id (e.g. Resend `re_...`'s id, NOT the token) captured at mint
   * via `extract.idPath`. VALUE-FREE — an identifier, never the secret. Stored so a later
   * ROTATION can revoke exactly this key by id. Absent for keys minted before rotation. */
  keyId?: string;
}

/**
 * A value-free record of one rotation (PRD Phase 2). Ids + timestamp + outcome only — NEVER
 * a secret value (an id is an identifier, not a credential). Appended on every rotation so
 * the audit trail survives; the outcome distinguishes a clean rotate (`done`), a safe abort
 * that kept/restored the old key (`aborted`), and a switched-but-not-revoked one (`partial`).
 */
export interface RotationRecord {
  varName: string;
  provider: string;
  oldKeyId?: string;
  newKeyId?: string;
  outcome: "done" | "aborted" | "partial";
  /** Plain-language cause (abort reason / "revoke manually" note). No value. */
  reason?: string;
  /** ISO-8601 timestamp of the rotation. */
  ts: string;
}

/** A per-account ROOT credential — the master key that MINTS other keys. Lives in
 * the GLOBAL vault (not per-repo), keyed by `provider` or `provider:account`
 * (agency multi-account). NEVER returned by any endpoint/tool — the daemon only
 * ever substitutes it into an outbound call toward an allowlisted provider host.
 *
 * LEGACY shape (one root per `provider(:account)` key). The registry (`rootRegistry`,
 * multiple NAMED roots per provider) superseded it; this stays for backward-READ of an
 * older store file. On any registry write it is migrated forward into `rootRegistry`. */
export interface RootCredential {
  value: string;
  /** ISO-8601 timestamp of the last write. */
  updatedAt: string;
}

/** A value-free resource a root can scope to (cached from a discovery probe) — id + name,
 * NEVER a secret. Mirrors core's DiscoveredResource without a cross-lib type dependency. */
export interface RootResource {
  id: string;
  name: string;
}

/**
 * ONE named root in the registry (PRD §4.4 multi-root). A provider can hold MANY — e.g.
 * a "prod" and a "staging" Resend root — each with its own metadata, distinguished by the
 * server-generated `id`. The `value` is the master key; it lives in the SAME 0600 vault and
 * NEVER leaves the daemon except substituted into an outbound call to an allowlisted host.
 * Everything EXCEPT `value` is safe to surface (see RootInfo) — labels/accounts/expiry/
 * resource names are value-free.
 */
export interface RootEntry {
  /** Server-generated stable id — the ONLY safe handle a mint selection references. */
  id: string;
  /** Lowercased provider (the allowlist + discovery-spec key), e.g. `resend`. */
  provider: string;
  /** Human label distinguishing sibling roots of one provider (e.g. `prod`, `staging`). */
  label?: string;
  /** Agency sub-account (the legacy `:account` suffix), case-preserved. */
  account?: string;
  /** The master key — NEVER surfaced. */
  value: string;
  /** Value-free resources cached from a discovery probe (names/ids only). */
  discoveredResources?: RootResource[];
  /** Unix ms the root itself expires (a rotating token), or undefined for a static key. */
  expiresAt?: number;
  /** Unix ms the root was stored. */
  createdAt: number;
}

/** The value-free view of a root — everything in RootEntry EXCEPT `value`. This is the
 * ONLY root shape that may cross an agent/dashboard surface (the mint choice, the intake
 * "roots held" list). check:no-leak stays green because `value` is structurally absent. */
export interface RootInfo {
  id: string;
  provider: string;
  label?: string;
  account?: string;
  discoveredResources?: RootResource[];
  expiresAt?: number;
  createdAt: number;
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
  /** LEGACY global root-key vault, keyed by `provider`(+`:account`), ONE root each.
   * Read for backward-compat; migrated into `rootRegistry` on the next registry write. */
  roots?: Record<string, RootCredential>;
  /** The multi-root registry (PRD §4.4) — MANY named roots per provider. The current
   * source of truth; optional so an older store (only `roots`) reads clean. */
  rootRegistry?: RootEntry[];
  /** OAuth grants, keyed by `provider`. Optional so an older store reads clean. */
  grants?: Record<string, Grant>;
  /** The control-plane session (account sign-in). Optional so an older store reads clean. */
  session?: Session;
  /** The value-free rotation audit log (PRD Phase 2). Optional so an older store reads clean. */
  rotations?: RotationRecord[];
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
      rootRegistry: parsed.rootRegistry ?? [],
      grants: parsed.grants ?? {},
      ...(parsed.session ? { session: parsed.session } : {}),
      ...(parsed.rotations ? { rotations: parsed.rotations } : {}),
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

// ── the multi-root registry (many NAMED master keys per provider) ────────────

/** Split `provider(:account)` → a lowercased provider + a case-preserved account. The
 * provider segment is case-insensitive (allowlist/spec keys are lowercase); the account
 * suffix is preserved (an agency `:Client-X` is distinct from `:client-x`). */
function parseProviderAccount(providerAccount: string): { provider: string; account?: string } {
  const [provider, ...rest] = providerAccount.split(":");
  const account = rest.join(":");
  return { provider: (provider ?? providerAccount).toLowerCase(), ...(account ? { account } : {}) };
}

/** Legacy `roots` map → registry entries. The map key is `provider(:account)` (provider
 * already lowercased by the old normRootKey); one value each, no label. A stable
 * `legacy:<key>` id keeps read-path resolution-by-id deterministic before any migration. */
function legacyToEntries(roots: Record<string, RootCredential>): RootEntry[] {
  return Object.entries(roots).map(([key, cred]) => {
    const [provider, ...rest] = key.split(":");
    const account = rest.join(":");
    return {
      id: `legacy:${key}`,
      provider: provider ?? key,
      ...(account ? { account } : {}),
      value: cred.value,
      createdAt: Date.parse(cred.updatedAt) || Date.now(),
    };
  });
}

/** The unified root list = registry ⊕ any not-yet-migrated legacy entries. A legacy entry
 * whose (provider, account) a label-less registry entry already covers is dropped (a
 * re-paste that migrated forward wins), so the same root never double-counts. Non-mutating —
 * the read path; writes migrate forward via `migrate`. */
function entriesOf(store: Store): RootEntry[] {
  const reg = store.rootRegistry ?? [];
  const pa = (e: RootEntry) => `${e.provider}:${e.account ?? ""}`;
  const covered = new Set(reg.filter((e) => !e.label).map(pa));
  const legacy = legacyToEntries(store.roots ?? {}).filter((e) => !covered.has(pa(e)));
  return [...reg, ...legacy];
}

/** Fold the legacy `roots` map into `rootRegistry` and drop it (migrate-forward). Called
 * before every registry WRITE so the file converges to the registry shape without ever
 * losing an old root. Idempotent (no legacy map → no-op). */
function migrate(store: Store): void {
  store.rootRegistry ??= [];
  const legacy = store.roots ?? {};
  if (Object.keys(legacy).length === 0) return;
  const pa = (e: { provider: string; account?: string }) => `${e.provider}:${e.account ?? ""}`;
  const covered = new Set(store.rootRegistry.filter((e) => !e.label).map(pa));
  for (const e of legacyToEntries(legacy)) {
    if (!covered.has(pa(e))) store.rootRegistry.push(e);
  }
  delete store.roots;
}

/** The registry entries matching `provider(:account)` — the candidate roots a mint for that
 * account could spend. Same filter `resolveRoot` uses to decide ambiguity. */
function matchRoots(store: Store, providerAccount: string): RootEntry[] {
  const { provider, account } = parseProviderAccount(providerAccount);
  return entriesOf(store).filter(
    (e) => e.provider === provider && (e.account ?? "") === (account ?? ""),
  );
}

/** Strip the secret `value` → the value-free view safe to surface. */
function toInfo(e: RootEntry): RootInfo {
  const { value: _value, ...info } = e;
  return info;
}

/**
 * Add a NAMED root to the registry (PRD §4.4). Unlike `putRoot`, this ALWAYS appends — a
 * provider can hold many (e.g. `resend` "prod" + "staging"), told apart by label + the
 * server-generated id. The GLOBAL 0600 vault; the value NEVER leaves the daemon except
 * substituted into an outbound call to an allowlisted host. Returns the value-free RootInfo.
 */
export function addRoot(input: {
  provider: string;
  label?: string;
  account?: string;
  value: string;
  expiresAt?: number;
  discoveredResources?: RootResource[];
}): RootInfo {
  const store = readStore();
  migrate(store);
  const entry: RootEntry = {
    id: randomBytes(8).toString("hex"),
    provider: input.provider.toLowerCase(),
    ...(input.label ? { label: input.label } : {}),
    ...(input.account ? { account: input.account } : {}),
    value: input.value,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.discoveredResources ? { discoveredResources: input.discoveredResources } : {}),
    createdAt: Date.now(),
  };
  store.rootRegistry ??= [];
  store.rootRegistry.push(entry);
  writeStore(store);
  return toInfo(entry);
}

/**
 * Store a root for `providerAccount` — the LEGACY single-root path, kept working. Unlike
 * `addRoot`, this UPSERTS the label-less entry for that provider(:account): a re-paste under
 * the same account replaces the value rather than accumulating duplicates. So a caller that
 * only ever set one root per provider keeps one-root semantics; `addRoot` is the named path.
 */
export function putRoot(providerAccount: string, value: string): void {
  const store = readStore();
  migrate(store);
  const { provider, account } = parseProviderAccount(providerAccount);
  store.rootRegistry ??= [];
  const existing = store.rootRegistry.find(
    (e) => e.provider === provider && (e.account ?? "") === (account ?? "") && !e.label,
  );
  if (existing) {
    existing.value = value;
    existing.createdAt = Date.now();
  } else {
    store.rootRegistry.push({
      id: randomBytes(8).toString("hex"),
      provider,
      ...(account ? { account } : {}),
      value,
      createdAt: Date.now(),
    });
  }
  writeStore(store);
}

/**
 * Resolve a root VALUE for `providerAccount`, or null. Daemon-internal — the caller
 * substitutes it into an allowlisted call, never surfaces it. Backward-compat contract:
 * EXACTLY one matching root → its value; ZERO → null (no-root recovery); MORE THAN ONE →
 * null (AMBIGUOUS — the mint flow must ask which via a root choice, not silently pick).
 */
export function resolveRoot(providerAccount: string): string | null {
  const m = matchRoots(readStore(), providerAccount);
  return m.length === 1 ? (m[0] as RootEntry).value : null;
}

/** Resolve a root VALUE by its registry id, or null. Daemon-internal — how an approved
 * mint spends the SPECIFIC root the human selected from the value-free choice. */
export function resolveRootById(id: string): string | null {
  return entriesOf(readStore()).find((e) => e.id === id)?.value ?? null;
}

/** Value-free registry view — RootInfo[], NEVER a value. `provider` filters to one
 * provider's roots. Safe to surface (the dashboard "roots held" list). */
export function listRoots(provider?: string): RootInfo[] {
  const p = provider?.toLowerCase();
  return entriesOf(readStore())
    .filter((e) => !p || e.provider === p)
    .map(toInfo);
}

/** The value-free candidate roots for a mint against `provider(:account)` — the choice
 * the mint flow surfaces when there's more than one. Same match as `resolveRoot`. */
export function listRootsFor(providerAccount: string): RootInfo[] {
  return matchRoots(readStore(), providerAccount).map(toInfo);
}

/** The provider(+account) NAMES we hold a root for — names only, never a value. Kept for
 * backward-compat; `listRoots` is the richer value-free view. */
export function listRootAccounts(): string[] {
  return listRoots().map((r) => (r.account ? `${r.provider}:${r.account}` : r.provider));
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

// ── the rotation audit log (PRD Phase 2; value-free ids + outcomes) ──────────

/** Append one value-free rotation record to the audit log (same 0600 file). */
export function appendRotation(rec: RotationRecord): void {
  const store = readStore();
  store.rotations ??= [];
  store.rotations.push(rec);
  writeStore(store);
}

/** The rotation audit log — ids + timestamps + outcomes only, NEVER a value. */
export function listRotations(): RotationRecord[] {
  return readStore().rotations ?? [];
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
