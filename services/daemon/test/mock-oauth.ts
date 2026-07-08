/// <reference types="bun-types" />
import { createHash } from "node:crypto";

/**
 * A tiny fake OAuth provider over real HTTP — the loopback authorize + token endpoints
 * the "Connect a provider" e2e drives against (PRD §4.9). Deterministic, no cloud:
 *
 *   GET  /authorize   → 302 back to redirect_uri?code=…&state=… (remembers the PKCE challenge)
 *   POST /token       → validates the PKCE verifier (S256), returns a fixed access/refresh token
 *   POST /mint        → a PROTECTED resource: Bearer <access token> → { api_key } (the mint target)
 *
 * The issued token is a fixed SENTINEL so the e2e can assert it reached the host but
 * NEVER appeared in any daemon → client response. `authSeen` records every Authorization
 * header the fake received (proves `{{ROOT}}` was substituted with the grant token).
 */

/** The fixed tokens the fake issues (sentinels the leak assertions hunt for). */
export const MOCK_OAUTH_ACCESS = "mock-oauth-access-SENTINEL-abc123";
export const MOCK_OAUTH_REFRESH = "mock-oauth-refresh-SENTINEL-def456";
export const MOCK_OAUTH_REFRESHED_ACCESS = "mock-oauth-access-REFRESHED-xyz789";
/** The value the protected /mint endpoint hands back on a valid bearer (also a sentinel). */
export const MOCK_MINTED_KEY = "mock-minted-api-key-SENTINEL-ghi012";

export interface MockOAuth {
  authorizeUrl: string;
  tokenUrl: string;
  mintUrl: string;
  authSeen: string[];
  stop: () => void;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

export function startMockOAuth(): MockOAuth {
  const authSeen: string[] = [];
  // code → the PKCE challenge presented at /authorize, verified at /token.
  const challenges = new Map<string, string>();

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const auth = req.headers.get("authorization");
      if (auth) authSeen.push(auth);

      if (url.pathname === "/authorize" && req.method === "GET") {
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state") ?? "";
        const challenge = url.searchParams.get("code_challenge") ?? "";
        if (!redirectUri) return new Response("missing redirect_uri", { status: 400 });
        const code = `mock-code-${b64url(createHash("sha256").update(state).digest()).slice(0, 8)}`;
        challenges.set(code, challenge);
        const dest = new URL(redirectUri);
        dest.searchParams.set("code", code);
        dest.searchParams.set("state", state);
        return new Response(null, { status: 302, headers: { Location: dest.toString() } });
      }

      if (url.pathname === "/token" && req.method === "POST") {
        const form = new URLSearchParams(await req.text());
        const grantType = form.get("grant_type");
        if (grantType === "refresh_token") {
          if (form.get("refresh_token") !== MOCK_OAUTH_REFRESH) {
            return json({ error: "bad refresh token" }, 400);
          }
          return json({
            access_token: MOCK_OAUTH_REFRESHED_ACCESS,
            token_type: "bearer",
            expires_in: 3600,
            scope: "read write",
          });
        }
        const code = form.get("code") ?? "";
        const verifier = form.get("code_verifier") ?? "";
        const expected = challenges.get(code);
        if (expected === undefined) return json({ error: "unknown code" }, 400);
        // PKCE S256: base64url(sha256(verifier)) must equal the challenge sent at /authorize.
        const got = b64url(createHash("sha256").update(verifier).digest());
        if (got !== expected) return json({ error: "PKCE verifier mismatch" }, 400);
        challenges.delete(code);
        return json({
          access_token: MOCK_OAUTH_ACCESS,
          refresh_token: MOCK_OAUTH_REFRESH,
          token_type: "bearer",
          expires_in: 3600,
          scope: "read write",
        });
      }

      // The protected resource the mint spends the grant against.
      if (url.pathname === "/mint" && req.method === "POST") {
        if (
          auth !== `Bearer ${MOCK_OAUTH_ACCESS}` &&
          auth !== `Bearer ${MOCK_OAUTH_REFRESHED_ACCESS}`
        ) {
          return json({ error: "unauthorized" }, 401);
        }
        return json({ api_key: MOCK_MINTED_KEY });
      }

      return json({ error: "not found" }, 404);
    },
  });

  const base = `http://127.0.0.1:${server.port}`;
  return {
    authorizeUrl: `${base}/authorize`,
    tokenUrl: `${base}/token`,
    mintUrl: `${base}/mint`,
    authSeen,
    stop: () => server.stop(true),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
