import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readStore } from "./index";

/**
 * @ringtail/store/discover — local credential discovery (architecture.md §"Local
 * credential discovery"). Before Ringtail asks the human for a key, it scans a
 * SMALL allowlist of KNOWN credential stores — NEVER the whole disk — maps what it
 * finds to the manifest's env-var names, and hands back {name, source} so `plan`
 * can show "already connected" instead of "missing".
 *
 * VALUES are read (so they can be reused), but this module is daemon-internal: its
 * callers surface NAMES + provenance only, and a discovered value never crosses the
 * MCP boundary. Zero network, zero telemetry — pure file reads of known locations.
 *
 * Priority (first hit wins): process env > project .env.local > ~/.ringtail store
 *   > ~/.aws/credentials > ~/.config/gh/hosts.yml > ~/.wrangler.
 */
export interface DiscoveredCred {
  /** Manifest env-var name (e.g. CLOUDFLARE_API_TOKEN). */
  key: string;
  /** The real value found — daemon-internal, NEVER surfaced to the agent. */
  value: string;
  /** Where it was found, for the transparent "reused from …" report. */
  source: string;
}

/** Parse KEY=VALUE lines from a dotenv-style file (quotes stripped, comments skipped). */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v) out[m[1]!] = v;
  }
  return out;
}

/**
 * Read ONE var from the PROJECT's own `.env.local` ONLY (no other source). This is the
 * idempotency question — "did WE already provision this var FOR THIS PROJECT?" — and it must
 * NOT consult `process.env` (or the global vault / ~/.aws / gh / wrangler). The dogfood showed a
 * `RESEND_API_KEY` leaked into the calling shell's env from another project made the mint path
 * answer "already provisioned — reused" and land NOTHING in the target project. A var present only
 * in the shell but absent from THIS project's `.env.local` MUST count as MISSING → gets minted.
 * Returns the trimmed value found, or undefined. Never throws (missing file → undefined).
 */
export function readProjectEnvLocal(
  varName: string,
  envLocalPath = join(process.cwd(), ".env.local"),
): string | undefined {
  if (!existsSync(envLocalPath)) return undefined;
  const v = parseEnvFile(readFileSync(envLocalPath, "utf8"))[varName];
  return v && v.trim() ? v : undefined;
}

/** ~/.aws/credentials [default] → AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY. */
function scanAws(): Record<string, string> {
  const p = join(homedir(), ".aws", "credentials");
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  let inDefault = false;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const sec = /^\s*\[([^\]]+)\]/.exec(line);
    if (sec) {
      inDefault = sec[1]!.trim() === "default";
      continue;
    }
    if (!inDefault) continue;
    const kv = /^\s*([a-z_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!kv) continue;
    if (kv[1] === "aws_access_key_id") out.AWS_ACCESS_KEY_ID = kv[2]!;
    if (kv[1] === "aws_secret_access_key") out.AWS_SECRET_ACCESS_KEY = kv[2]!;
  }
  return out;
}

/** ~/.config/gh/hosts.yml → GITHUB_TOKEN (the gh CLI's stored oauth_token). */
function scanGh(): Record<string, string> {
  const p = join(homedir(), ".config", "gh", "hosts.yml");
  if (!existsSync(p)) return {};
  const m = /oauth_token:\s*(\S+)/.exec(readFileSync(p, "utf8"));
  return m ? { GITHUB_TOKEN: m[1]! } : {};
}

/**
 * ~/.wrangler → CLOUDFLARE_API_TOKEN.
 * ponytail: wrangler stores an OAuth access token; it works as a CF API bearer, so
 *   we map it best-effort. A stale/expired one is caught at validate-after-mint (the
 *   real probe), never trusted blind. Upgrade path: refresh via the stored
 *   refresh_token when a real expiry bites.
 */
function scanCloudflare(): Record<string, string> {
  for (const p of [
    join(homedir(), ".wrangler", "config", "default.toml"),
    join(homedir(), ".config", ".wrangler", "config", "default.toml"),
  ]) {
    if (!existsSync(p)) continue;
    const m = /oauth_token\s*=\s*"([^"]+)"/.exec(readFileSync(p, "utf8"));
    if (m) return { CLOUDFLARE_API_TOKEN: m[1]! };
  }
  return {};
}

/**
 * Scan the known stores for the `wanted` env-var names and return the first hit for
 * each (highest-priority source wins). Only known locations, only the requested
 * vars — a source that yields a var outside `wanted` is ignored. Never throws:
 * a missing/corrupt file is simply an empty source.
 */
export function discoverCredentials(
  wanted: string[],
  opts: { envLocalPath?: string; env?: Record<string, string | undefined> } = {},
): DiscoveredCred[] {
  const env = opts.env ?? process.env;
  const envLocalPath = opts.envLocalPath ?? join(process.cwd(), ".env.local");

  const sources: Array<[string, Record<string, string | undefined>]> = [
    ["process env", env],
    [
      ".env.local",
      existsSync(envLocalPath) ? parseEnvFile(readFileSync(envLocalPath, "utf8")) : {},
    ],
    [
      "~/.ringtail",
      Object.fromEntries(Object.entries(readStore().credentials).map(([k, c]) => [k, c.value])),
    ],
    ["~/.aws/credentials", scanAws()],
    ["~/.config/gh/hosts.yml", scanGh()],
    ["~/.wrangler", scanCloudflare()],
  ];

  const wantedSet = new Set(wanted);
  const seen = new Set<string>();
  const found: DiscoveredCred[] = [];
  for (const [source, values] of sources) {
    for (const [key, value] of Object.entries(values)) {
      if (!wantedSet.has(key) || seen.has(key)) continue;
      if (!value || !value.trim()) continue;
      seen.add(key);
      found.push({ key, value, source });
    }
  }
  return found;
}
