import { z } from "zod";

/**
 * @ringtail/config — the ONE public door for typed, validated runtime config.
 * Mirrors the shape of `.env.example`: ports for the daemon/dashboard + the
 * Infisical sink credentials. Zod is the trust boundary — malformed env throws
 * here, not three layers deep in a sink.
 */
export const EnvSchema = z.object({
  // Daemon (the machine surface) + dashboard (the human cockpit) ports.
  DAEMON_PORT: z.coerce.number().int().positive().default(4880),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(4881),
  // Infisical — the secret sink. All optional locally; required to actually sync.
  INFISICAL_CLIENT_ID: z.string().min(1).optional(),
  INFISICAL_CLIENT_SECRET: z.string().min(1).optional(),
  INFISICAL_PROJECT_ID: z.string().min(1).optional(),
  INFISICAL_ENVIRONMENT: z.enum(["dev", "staging", "prod"]).default("dev"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parse + validate once, then memoize. Pass an explicit source to override process.env (tests). */
export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  cached ??= EnvSchema.parse(source);
  return cached;
}

/** Test seam: drop the memoized env so the next getEnv() re-parses. */
export function resetEnv(): void {
  cached = undefined;
}
