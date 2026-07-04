import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * @ringtail/sinks — where provisioned keys land. Two sinks:
 *   1. .env.local (local dev)      — upsertEnvLocal (line-preserving, idempotent)
 *   2. Infisical, per environment  — writeInfisical (real machine-identity shape)
 *
 * syncCredential fans one key out per the environment routing (architecture.md
 * §"The env axis"):
 *   local            → .env.local ONLY   (the only env that touches your disk)
 *   dev/staging/prod  → Infisical ONLY   (deployed — never a local secret file)
 */
export type DeployedEnv = "dev" | "staging" | "prod";
export type Environment = "local" | DeployedEnv;

// KEY=… line, optionally a commented-out `# KEY=…`. Value ignored on read.
const ENV_LINE = /^(#\s*)?([A-Za-z_][A-Za-z0-9_]*)=/;

/** Quote a value that contains whitespace or `#` so dotenv parsers keep it whole. */
function quoteIfNeeded(v: string): string {
  return /[\s#'"]/.test(v) ? JSON.stringify(v) : v;
}

/**
 * Upsert `values` into the .env.local at `path`, preserving every other line.
 * - Existing `KEY=…` (or commented-out `# KEY=…`) → replaced in place.
 * - New key → appended under a provenance header.
 * - A key already at the same value → untouched (idempotent — re-runs are no-ops).
 * Returns which keys were written (added/changed) vs left as-is.
 */
export function upsertEnvLocal(
  path: string,
  values: Record<string, string>,
): { written: string[]; unchanged: string[] } {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing.length ? existing.split("\n") : [];
  const written: string[] = [];
  const unchanged: string[] = [];
  const remaining = new Set(Object.keys(values));

  const next = lines.map((line) => {
    const m = ENV_LINE.exec(line);
    if (!m) return line;
    const key = m[2]!;
    if (!(key in values)) return line;
    remaining.delete(key);
    const desired = `${key}=${quoteIfNeeded(values[key]!)}`;
    if (line === desired) {
      unchanged.push(key);
      return line;
    }
    written.push(key);
    return desired;
  });

  const appended: string[] = [];
  for (const key of remaining) {
    appended.push(`${key}=${quoteIfNeeded(values[key]!)}`);
    written.push(key);
  }
  if (appended.length) {
    if (next.length && next[next.length - 1] !== "") next.push(""); // separator
    next.push("# added by ringtail", ...appended);
  }

  writeFileSync(path, next.join("\n") + (next.at(-1) === "" ? "" : "\n"));
  return { written, unchanged };
}

async function infisicalPost(
  base: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // non-JSON body — leave null
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/**
 * Push secrets to Infisical for one environment via a Universal-Auth machine
 * identity: (1) POST universal-auth/login → access token, (2) POST the raw
 * secrets into the target project/environment. Base URL is `INFISICAL_API_URL`
 * (default app.infisical.com); creds are the INFISICAL_* machine-identity vars.
 *
 * When machine-identity creds are absent (local-only dev) this degrades to a
 * count-only log and resolves — never throws, never prints secret VALUES.
 *
 * // TODO(infisical): the exact v3 secret-upsert path/payload shifts per API
 * version; confirm against the live Infisical API before pointing at prod.
 */
export async function writeInfisical(
  env: DeployedEnv,
  values: Record<string, string>,
): Promise<void> {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectId = process.env.INFISICAL_PROJECT_ID;
  const base = process.env.INFISICAL_API_URL || "https://app.infisical.com";

  if (!clientId || !clientSecret || !projectId) {
    // ponytail: no machine identity → local-only run. Report the shape (count +
    // env), never the values, and move on. Wired for real once creds exist.
    console.log(
      `[sinks] Infisical(${env}): ${Object.keys(values).length} secret(s) staged (no machine-identity — skipped remote push)`,
    );
    return;
  }

  const login = await infisicalPost(base, "/api/v1/auth/universal-auth/login", {
    clientId,
    clientSecret,
  });
  if (!login.ok) {
    throw new Error(`Infisical login failed (${login.status})`);
  }
  const token = (login.body as { accessToken?: string }).accessToken;
  if (!token) throw new Error("Infisical login returned no accessToken");

  const upsert = await infisicalPost(
    base,
    "/api/v3/secrets/raw",
    {
      projectId,
      environment: env,
      secrets: Object.entries(values).map(([secretKey, secretValue]) => ({
        secretKey,
        secretValue,
      })),
    },
    token,
  );
  if (!upsert.ok) {
    throw new Error(`Infisical secret upsert failed (${upsert.status}) for ${env}`);
  }
}

/**
 * Fan one credential out per environment routing (architecture.md §"The env axis"):
 * `local` is the ONLY env that touches disk (.env.local); `dev/staging/prod` are
 * deployed and go to Infisical ONLY — never a local secret file for a remote env.
 * Returns whether the local file was touched, so callers can report where it landed.
 */
export async function syncCredential(
  key: string,
  value: string,
  opts: { env: Environment; envLocalPath?: string },
): Promise<{ wroteLocal: boolean }> {
  if (opts.env === "local") {
    upsertEnvLocal(opts.envLocalPath ?? ".env.local", { [key]: value });
    return { wroteLocal: true };
  }
  await writeInfisical(opts.env, { [key]: value });
  return { wroteLocal: false };
}
