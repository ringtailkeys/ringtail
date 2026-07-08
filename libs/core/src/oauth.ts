import { createHash, randomBytes } from "node:crypto";
import { type Grant, getGrant, putGrant } from "@ringtail/store";

/**
 * @ringtail/core — the OAuth "Connect a provider" registry + loopback PKCE helpers
 * (PRD §4.9). This is CONFIG, not per-provider code: one row per provider, the same
 * generic flow for all. The daemon runs the flow (start → authorize → callback →
 * token exchange); the grant lands in the ~/.ringtail vault value-free.
 *
 * THE GUARANTEE holds: an access/refresh token IS a secret value. It lives in the vault
 * and is substituted into an outbound call to an allowlisted host exactly like a pasted
 * root — it NEVER crosses the agent/MCP/SSE surface. Only NAMES + scopes + expiry do.
 *
 * Client credentials come from env (RINGTAIL_OAUTH_<PROVIDER>_CLIENT_ID / _CLIENT_SECRET).
 * Absent → the provider reports `needsClientCreds` and never crashes (listConnectors).
 */

export interface OAuthProvider {
  id: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Env var holding the OAuth app's client id (e.g. RINGTAIL_OAUTH_GITHUB_CLIENT_ID). */
  clientIdEnv: string;
  /** Env var holding the client secret. Absent → a public PKCE client (no secret). */
  clientSecretEnv?: string;
  /** Loopback PKCE (S256). true for every desktop/CLI-style client here. */
  usesPKCE: boolean;
  /** Where the user signs UP for the provider (agent-guided onboarding). */
  signupUrl?: string;
  /** Where the user manages OAuth apps / API keys for the provider (agent-guided). */
  apiKeysUrl?: string;
}

/**
 * The seeded registry. Endpoints/scopes are best-effort correct; anything marked TODO
 * needs verification against the provider's live docs before GO-LIVE (see the report's
 * per-provider checklist). `mock` is resolved at call time from env (getOAuthProvider).
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  github: {
    id: "github",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // TODO(verify): `repo` scopes the token to repo APIs. GitHub does NOT expose a
    // "create a new API key" OAuth scope — the OAuth access token IS the credential.
    scopes: ["repo", "read:org"],
    clientIdEnv: "RINGTAIL_OAUTH_GITHUB_CLIENT_ID",
    clientSecretEnv: "RINGTAIL_OAUTH_GITHUB_CLIENT_SECRET",
    usesPKCE: true,
    signupUrl: "https://github.com/join",
    apiKeysUrl: "https://github.com/settings/developers",
  },
  google: {
    id: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // TODO(verify): cloud-platform is broad; scope down to the exact API before GO-LIVE.
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    clientIdEnv: "RINGTAIL_OAUTH_GOOGLE_CLIENT_ID",
    clientSecretEnv: "RINGTAIL_OAUTH_GOOGLE_CLIENT_SECRET",
    usesPKCE: true,
    signupUrl: "https://accounts.google.com/signup",
    apiKeysUrl: "https://console.cloud.google.com/apis/credentials",
  },
  cloudflare: {
    id: "cloudflare",
    // The wrangler-style public PKCE flow (no client secret).
    authorizeUrl: "https://dash.cloudflare.com/oauth2/auth",
    tokenUrl: "https://dash.cloudflare.com/oauth2/token",
    // TODO(verify): wrangler uses account:read user:read workers:write + offline_access.
    scopes: ["account:read", "user:read", "offline_access"],
    clientIdEnv: "RINGTAIL_OAUTH_CLOUDFLARE_CLIENT_ID",
    usesPKCE: true,
    signupUrl: "https://dash.cloudflare.com/sign-up",
    apiKeysUrl: "https://dash.cloudflare.com/profile/api-tokens",
  },
  vercel: {
    id: "vercel",
    // TODO(verify): Vercel OAuth is the "integration" flow (confidential client, no PKCE).
    authorizeUrl: "https://vercel.com/oauth/authorize",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    scopes: [],
    clientIdEnv: "RINGTAIL_OAUTH_VERCEL_CLIENT_ID",
    clientSecretEnv: "RINGTAIL_OAUTH_VERCEL_CLIENT_SECRET",
    usesPKCE: false,
    signupUrl: "https://vercel.com/signup",
    apiKeysUrl: "https://vercel.com/account/tokens",
  },
};

/** Resolve a provider config. `mock`'s endpoints come from env at CALL TIME (the test
 * mock binds an ephemeral loopback port), so it can't be a static row. */
export function getOAuthProvider(id: string): OAuthProvider | null {
  const key = id.toLowerCase();
  if (key === "mock") {
    const authorizeUrl = process.env.RINGTAIL_OAUTH_MOCK_AUTHORIZE_URL;
    const tokenUrl = process.env.RINGTAIL_OAUTH_MOCK_TOKEN_URL;
    if (!authorizeUrl || !tokenUrl) return null;
    return {
      id: "mock",
      authorizeUrl,
      tokenUrl,
      scopes: ["read", "write"],
      clientIdEnv: "RINGTAIL_OAUTH_MOCK_CLIENT_ID",
      usesPKCE: true,
      apiKeysUrl: authorizeUrl,
    };
  }
  return OAUTH_PROVIDERS[key] ?? null;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

/** A fresh PKCE pair (S256): a high-entropy verifier + its SHA-256 challenge. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** A random opaque `state` (CSRF binding between /start and /callback). */
export function generateState(): string {
  return randomBytes(16).toString("hex");
}

/** The client id from env, or undefined (→ provider not configured). */
export function clientId(p: OAuthProvider): string | undefined {
  return process.env[p.clientIdEnv] || undefined;
}
function clientSecret(p: OAuthProvider): string | undefined {
  return p.clientSecretEnv ? process.env[p.clientSecretEnv] || undefined : undefined;
}

/** Build the provider's authorize URL for a loopback redirect + PKCE challenge. */
export function buildAuthorizeUrl(
  p: OAuthProvider,
  args: { redirectUri: string; state: string; challenge: string },
): string {
  const id = clientId(p);
  if (!id) throw new Error(`${p.id}: no client id (set ${p.clientIdEnv})`);
  const u = new URL(p.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("state", args.state);
  if (p.scopes.length) u.searchParams.set("scope", p.scopes.join(" "));
  if (p.usesPKCE) {
    u.searchParams.set("code_challenge", args.challenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

/** Parse a token endpoint response (JSON, or form-encoded fallback for older GitHub). */
async function parseTokenResponse(res: Response): Promise<Record<string, string>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function toGrant(p: OAuthProvider, tok: Record<string, string>): Grant {
  const now = Date.now();
  const expiresIn = tok.expires_in ? Number(tok.expires_in) : undefined;
  const scope = tok.scope ?? "";
  return {
    provider: p.id,
    // Callers (exchangeCode/refreshGrant) reject a response with no access_token BEFORE
    // reaching here, so the assertion is safe under noUncheckedIndexedAccess.
    accessToken: tok.access_token!,
    ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
    scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : p.scopes,
    ...(expiresIn ? { expiresAt: now + expiresIn * 1000 } : {}),
    obtainedAt: now,
  };
}

/** Exchange an authorization `code` (+ PKCE verifier) for a grant at the token endpoint.
 * Daemon-internal: the returned Grant carries tokens and goes straight to the vault. */
export async function exchangeCode(
  p: OAuthProvider,
  args: { code: string; verifier: string; redirectUri: string },
): Promise<Grant> {
  const id = clientId(p);
  if (!id) throw new Error(`${p.id}: no client id (set ${p.clientIdEnv})`);
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: id,
  });
  if (p.usesPKCE) form.set("code_verifier", args.verifier);
  const secret = clientSecret(p);
  if (secret) form.set("client_secret", secret);
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
    redirect: "manual",
  });
  const tok = await parseTokenResponse(res);
  if (!res.ok || !tok.access_token) {
    throw new Error(`token exchange failed (${res.status})${tok.error ? `: ${tok.error}` : ""}`);
  }
  return toGrant(p, tok);
}

/** Refresh an expired grant. Throws if the provider gave no refresh token. */
export async function refreshGrant(p: OAuthProvider, grant: Grant): Promise<Grant> {
  if (!grant.refreshToken) throw new Error(`${p.id}: grant has no refresh token`);
  const id = clientId(p);
  if (!id) throw new Error(`${p.id}: no client id (set ${p.clientIdEnv})`);
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: grant.refreshToken,
    client_id: id,
  });
  const secret = clientSecret(p);
  if (secret) form.set("client_secret", secret);
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
    redirect: "manual",
  });
  const tok = await parseTokenResponse(res);
  if (!res.ok || !tok.access_token) {
    throw new Error(`refresh failed (${res.status})${tok.error ? `: ${tok.error}` : ""}`);
  }
  const next = toGrant(p, tok);
  // A refresh response often omits a new refresh token → keep the old one.
  if (!next.refreshToken && grant.refreshToken) next.refreshToken = grant.refreshToken;
  return next;
}

/** 60s skew so we refresh just BEFORE the provider would reject the token. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * Resolve a usable access token for `provider` from the vault, refreshing in place if
 * it's expired and refreshable. Daemon-INTERNAL: the token is substituted into an
 * allowlisted call by the mint executor, never surfaced. null = no grant (or refresh
 * failed / no client creds to refresh with) → the mint path falls back to no-root.
 */
export async function resolveGrantToken(provider: string): Promise<string | null> {
  const grant = getGrant(provider);
  if (!grant) return null;
  const expired = grant.expiresAt !== undefined && grant.expiresAt - EXPIRY_SKEW_MS <= Date.now();
  if (!expired) return grant.accessToken;
  const p = getOAuthProvider(provider);
  if (!p || !grant.refreshToken) return grant.accessToken; // can't refresh → try as-is
  try {
    const next = await refreshGrant(p, grant);
    putGrant(provider, next);
    return next.accessToken;
  } catch {
    return grant.accessToken; // refresh failed → let the provider reject → surfaces as scope/failed
  }
}

/** The agent-guided connector catalogue — value-free (names + urls + booleans). Lets the
 * agent/dashboard say "sign up / manage keys here" and see what's connected or needs creds. */
export function listConnectors(): Array<{
  id: string;
  connected: boolean;
  needsClientCreds: boolean;
  scopes: string[];
  signupUrl?: string;
  apiKeysUrl?: string;
}> {
  return Object.values(OAUTH_PROVIDERS).map((p) => ({
    id: p.id,
    connected: getGrant(p.id) !== null,
    needsClientCreds: clientId(p) === undefined,
    scopes: p.scopes,
    ...(p.signupUrl ? { signupUrl: p.signupUrl } : {}),
    ...(p.apiKeysUrl ? { apiKeysUrl: p.apiKeysUrl } : {}),
  }));
}
