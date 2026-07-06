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
  // The hosted account/billing control-plane the OSS tool CALLS for sign-in +
  // entitlement (Better Auth + Dodo). The tool ships NO auth/billing of its own —
  // only email/session/usage-count ever crosses this wire, NEVER a provider secret.
  // Overridable for self-host/dev; defaults to the prod control-plane.
  RINGTAIL_CONTROL_PLANE_URL: z.string().url().default("https://ringtail.dev"),
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
