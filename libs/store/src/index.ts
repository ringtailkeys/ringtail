import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * @ringtail/store — root credential store at ~/.ringtail/credentials.json.
 * ~/.aws-style: acquired once, reused across every repo on the machine.
 * Dir is 0700, file is 0600 — enforced via chmod on every write (a fresh
 * umask can't loosen it). This is a trust boundary: secrets on disk.
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

const DIR = join(homedir(), ".ringtail");
const FILE = join(DIR, "credentials.json");

export function readStore(): Store {
  if (!existsSync(FILE)) return { credentials: {} };
  return JSON.parse(readFileSync(FILE, "utf8")) as Store;
}

export function writeStore(store: Store): void {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700); // mkdir mode is umask-masked; chmod is not.
  writeFileSync(FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  chmodSync(FILE, 0o600);
}

/** Convenience upsert: read → set one credential → write, preserving 0600. */
export function putCredential(key: string, cred: Credential): void {
  const store = readStore();
  store.credentials[key] = cred;
  writeStore(store);
}
