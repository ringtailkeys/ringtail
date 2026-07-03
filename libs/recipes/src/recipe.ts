// The provider-recipe contract. Every provider (cloudflare, neon, better-auth,
// resend, …) ships one `Recipe` in src/recipes/<id>.ts. Core (@ringtail/core) is
// provider-agnostic — it only knows this interface. Treat the shapes here as frozen.

/** Result of a real API probe against the entered/minted credentials. */
export interface ValidateResult {
  /** True iff the credentials authenticated AND carry every required scope. */
  ok: boolean;
  /** Human-readable outcome ("authenticated as acct 1a2b", "401 invalid token"). */
  detail?: string;
  /** Scopes/permissions the probe observed the token to hold. */
  scopes?: string[];
  /** Required scopes the probe found MISSING (drives the wrong-scope flag). */
  missing?: string[];
}

/**
 * How a recipe obtains its credentials:
 * - 'auto'     — provider has a management API we can call to mint the token/resource.
 * - 'guided'   — user creates the key by hand (deep-linked), we validate it.
 * - 'generate' — no external account; we mint the value locally (e.g. an auth secret).
 */
export type Mode = "auto" | "guided" | "generate";

/** Context handed to `autoProvision` — what to name things + where to log progress. */
export interface ProvisionCtx {
  /** The repo we're provisioning for (project/db naming). */
  repoName: string;
  /** Optional custom domain, for DNS-creating providers. */
  domain?: string;
  /** Progress sink — core wires this to the status stream. Never log secret values. */
  log: (m: string) => void;
}

export interface Recipe {
  /** Stable id, also the store key for root creds. e.g. 'cloudflare'. */
  id: string;
  /** Display name. e.g. 'Cloudflare'. */
  title: string;
  mode: Mode;
  /** Which .env vars this recipe fills. e.g. ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']. */
  envVars: string[];
  /** Deep-link to the exact token-creation page (guided mode). */
  tokenCreateUrl?: string;
  /** Docs link shown alongside the prompt. */
  docsUrl?: string;
  /** Human-readable scopes the user must grant when creating the token. */
  requiredScopes?: string[];
  /** Which keys are ROOT creds — stored in ~/.ringtail and reused across repos. */
  rootCredKeys?: string[];
  /**
   * Mint a scoped token from an OAuth-style token endpoint (the mock provider and
   * future auto providers that hand back a short-lived scoped token). Returns the
   * env values it obtained. Optional — guided recipes have the user paste instead.
   */
  mint?(): Promise<Record<string, string>>;
  /** REAL API probe — validate-AFTER-mint. Returns whether creds work + what they can do. */
  validate?(creds: Record<string, string>): Promise<ValidateResult>;
  /** For mode:'generate' — mint the value(s) locally, no network. */
  generate?(): Record<string, string>;
  /** For mode:'auto' — create the project/db/dns and return the resulting env values. */
  autoProvision?(creds: Record<string, string>, ctx: ProvisionCtx): Promise<Record<string, string>>;
}
