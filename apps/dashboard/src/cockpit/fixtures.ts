import type { CredentialStatus } from "@ringtail/ui";

/**
 * Realistic mock connection data for the cockpit demo — NO daemon needed. Each
 * provider carries a per-environment credential status; the grid, rows, and the
 * provision sequence all render straight off these fixtures. Green is SACRED:
 * only `validated` / `synced` cells earn it.
 */

export type Env = "dev" | "staging" | "prod";
export const ENVS: Env[] = ["dev", "staging", "prod"];

export interface Provider {
  id: string;
  /** Env-var names this provider owns (from the `.env.example` manifest). */
  envVars: string[];
  envs: Record<Env, CredentialStatus>;
}

const all = (s: CredentialStatus): Record<Env, CredentialStatus> => ({
  dev: s,
  staging: s,
  prod: s,
});

/** Fresh machine — nothing raided yet, every cell honestly missing. */
export const EMPTY: Provider[] = [
  {
    id: "cloudflare",
    envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    envs: all("missing"),
  },
  { id: "database", envVars: ["DATABASE_URL"], envs: all("missing") },
  { id: "resend", envVars: ["RESEND_API_KEY"], envs: all("missing") },
  { id: "stripe", envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], envs: all("missing") },
];

/** Mid-raid — some synced, one env still validating, a dud wrong-scope key, keys pending consent. */
export const MIXED: Provider[] = [
  {
    id: "cloudflare",
    envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    envs: { dev: "synced", staging: "synced", prod: "validating" },
  },
  { id: "database", envVars: ["DATABASE_URL"], envs: all("synced") },
  { id: "resend", envVars: ["RESEND_API_KEY"], envs: all("needs-consent") },
  {
    id: "stripe",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    envs: { dev: "synced", staging: "wrong-scope", prod: "provisioning" },
  },
  { id: "sendgrid", envVars: ["SENDGRID_API_KEY"], envs: all("missing") },
];

/** Everybody's home — all stashed and synced across every environment. */
export const ALL_GREEN: Provider[] = [
  {
    id: "cloudflare",
    envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    envs: all("synced"),
  },
  { id: "database", envVars: ["DATABASE_URL"], envs: all("synced") },
  { id: "resend", envVars: ["RESEND_API_KEY"], envs: all("synced") },
  { id: "stripe", envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], envs: all("synced") },
];

/** A single provider fixed to one status across all envs — powers the per-state Provider Row stories. */
export function providerInState(status: CredentialStatus): Provider {
  return {
    id: "cloudflare",
    envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    envs: all(status),
  };
}
