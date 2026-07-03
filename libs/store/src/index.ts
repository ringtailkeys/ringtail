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
export interface Credential {
  value: string;
  provider: string;
  /** ISO-8601 timestamp of the last write. */
  updatedAt: string;
}

export interface Store {
  /** Keyed by env-var name (e.g. CLOUDFLARE_API_TOKEN). */
  credentials: Record<string, Credential>;
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
    return { credentials: parsed.credentials ?? {} };
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
