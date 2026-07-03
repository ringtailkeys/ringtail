import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * @ringtail/sinks — where provisioned keys land. Two sinks:
 *   1. .env.local (local dev)         — writeEnvLocal
 *   2. Infisical, per environment     — writeInfisical (stub)
 * syncCredential fans a single key out to both.
 */
export type Environment = "dev" | "staging" | "prod";

const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/**
 * Idempotent, line-preserving upsert into a dotenv file. Existing keys are
 * updated in place (comments/order/blank lines untouched); new keys appended.
 */
export function writeEnvLocal(path: string, values: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing === "" ? [] : existing.split("\n");
  const seen = new Set<string>();

  const out = lines.map((line) => {
    const key = ENV_LINE.exec(line)?.[1];
    if (key !== undefined && key in values) {
      seen.add(key);
      return `${key}=${values[key] ?? ""}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }

  writeFileSync(path, out.join("\n"));
}

/**
 * Push secrets to Infisical for one environment.
 * TODO: real Infisical API — machine-identity auth then upsert secrets into
 * the target project/environment (INFISICAL_* from @ringtail/config).
 */
export function writeInfisical(env: Environment, values: Record<string, string>): Promise<void> {
  console.log(`[sinks] would sync ${Object.keys(values).length} secret(s) → Infisical (${env})`);
  return Promise.resolve();
}

/** Fan one credential out to both sinks. */
export async function syncCredential(
  key: string,
  value: string,
  opts: { env: Environment; envLocalPath?: string },
): Promise<void> {
  writeEnvLocal(opts.envLocalPath ?? ".env.local", { [key]: value });
  await writeInfisical(opts.env, { [key]: value });
}
