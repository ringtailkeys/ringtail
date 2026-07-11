import { z } from "zod";

/**
 * @ringtail/config — the ONE public door for typed, validated runtime config.
 * Mirrors the shape of `.env.example`: ports for the daemon/dashboard + the
 * Infisical sink credentials. Zod is the trust boundary — malformed env throws
 * here, not three layers deep in a sink.
 */
export const EnvSchema = z.object({
  // Which edition is running. `oss` = `ringtail up` from source: unlimited, free, NO
  // account, NO control-plane calls — the goodwill tier. `app` = the native desktop
  // build: sign-in wall + freemium metering + upgrade. Defaults to `oss` so building
  // from source is ALWAYS ungated; only `apps/desktop` sets `app` on its sidecar.
  RINGTAIL_EDITION: z.enum(["oss", "app"]).default("oss"),
  // Daemon (the machine surface) + dashboard (the human cockpit) ports.
  DAEMON_PORT: z.coerce.number().int().positive().default(4880),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(4881),
  // The hosted account/billing control-plane the OSS tool CALLS for sign-in +
  // entitlement (Better Auth + Dodo). The tool ships NO auth/billing of its own —
  // only email/session/usage-count ever crosses this wire, NEVER a provider secret.
  // Overridable for self-host/dev; defaults to the prod control-plane.
  RINGTAIL_CONTROL_PLANE_URL: z.string().url().default("https://ringtailkeys.com"),
  // Infisical — the secret sink. All optional locally; required to actually sync.
  INFISICAL_CLIENT_ID: z.string().min(1).optional(),
  INFISICAL_CLIENT_SECRET: z.string().min(1).optional(),
  INFISICAL_PROJECT_ID: z.string().min(1).optional(),
  INFISICAL_ENVIRONMENT: z.enum(["dev", "staging", "prod"]).default("dev"),
  // BROWSER-MINT. When a provider has NO mint-API (a dashboard-only key), Ringtail drives its web
  // console with a browser to produce the value. OFF by default: it needs a running Envoyage engine,
  // so a fresh `ringtail up` must never fail on a missing browser. BOTH modes CONSUME the same
  // `@envoyage/browser` SDK client and differ ONLY by endpoint (the deploy model's "swap a URL"):
  // `local` = a local `envoyage serve` (OSS, spawned when no URL is set, owns a local Chromium);
  // `cloud` = the HOSTED Envoyage endpoint (paid tier), which owns the CF browser. The engine — not
  // Ringtail — owns all driving + the password-blind boundary in either mode.
  RINGTAIL_BROWSER_MODE: z.enum(["off", "local", "cloud"]).default("off"),
  // The Envoyage engine endpoint. REQUIRED for `cloud` (the hosted engine's URL). Optional for
  // `local` — point at an already-running `envoyage serve`, or leave unset and the daemon spawns one.
  RINGTAIL_ENVOYAGE_URL: z.string().url().optional(),
  // Bearer for a non-loopback Envoyage engine (the hosted `cloud` endpoint). A loopback `local`
  // engine needs none.
  RINGTAIL_ENVOYAGE_TOKEN: z.string().min(1).optional(),
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
