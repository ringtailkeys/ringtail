/// <reference types="bun-types" />
/**
 * A self-contained fake provider + fake Infisical, over real HTTP. This is what
 * makes the e2e REAL (actual fetch/JSON round-trips) and REPEATABLE (no cloud
 * accounts, no randomness). Started by the e2e; the mock recipe (@ringtail/recipes)
 * reaches it via MOCK_PROVIDER_URL, the Infisical sink via INFISICAL_API_URL.
 *
 * Provider endpoints:
 *   POST /oauth/token   {grant:'full'|'partial'} → {token}         (mint a scoped token)
 *   POST /validate      {token}                  → {scopes}        (what the token carries)
 *   POST /provision     {token, repoName}        → {resourceId}    (create the resource)
 * Infisical endpoints (real machine-identity shape):
 *   POST /api/v1/auth/universal-auth/login {clientId, clientSecret} → {accessToken}
 *   POST /api/v3/secrets/raw               {environment, secrets}   → {ok:true}
 *
 * Deterministic: a 'full' grant always carries [read, write]; a 'partial' grant
 * always carries [read] only — the fixed wrong-scope case the e2e asserts.
 */

const SCOPES_BY_GRANT: Record<string, string[]> = {
  full: ["read", "write"],
  partial: ["read"],
};
const SCOPES_BY_TOKEN: Record<string, string[]> = {
  "mock-token-full": ["read", "write"],
  "mock-token-partial": ["read"],
};

export interface MockCalls {
  oauthToken: Array<{ grant: string }>;
  validate: Array<{ token: string }>;
  provision: Array<{ repoName: string }>;
  /** One entry per Infisical secret-upsert — the assertion target for "called per-env". */
  infisical: Array<{ env: string; keys: string[] }>;
  /** Every `Authorization` header the fake received — lets the generic-executor e2e
   * assert the root key was substituted into `{{ROOT}}` and reached the allowlisted host. */
  authSeen: string[];
}

export interface MockProvider {
  url: string;
  calls: MockCalls;
  stop: () => void;
}

/** Boot the fake on an ephemeral port. Call stop() when done. */
export function startMockProvider(): MockProvider {
  const calls: MockCalls = {
    oauthToken: [],
    validate: [],
    provision: [],
    infisical: [],
    authSeen: [],
  };

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      const auth = req.headers.get("authorization");
      if (auth) calls.authSeen.push(auth);
      const body = req.method === "POST" ? ((await req.json()) as Record<string, unknown>) : {};

      switch (pathname) {
        case "/oauth/token": {
          const grant = String(body.grant ?? "full");
          calls.oauthToken.push({ grant });
          if (!(grant in SCOPES_BY_GRANT)) return json({ error: "bad grant" }, 400);
          return json({ token: `mock-token-${grant}`, scopes: SCOPES_BY_GRANT[grant] });
        }
        case "/validate": {
          const token = String(body.token ?? "");
          calls.validate.push({ token });
          const scopes = SCOPES_BY_TOKEN[token];
          if (!scopes) return json({ error: "unknown token" }, 401);
          return json({ scopes });
        }
        case "/provision": {
          const repoName = String(body.repoName ?? "app");
          calls.provision.push({ repoName });
          // Failed-action variant (rate-limit/conflict) — deterministic, flag-driven,
          // so recovery (Layer 4) is provable offline. A plain-language error the
          // engine surfaces as a `failed` state + reason (never a secret value).
          if (body.fail) {
            return json({ error: "rate limited: too many provisioning requests (429)" }, 429);
          }
          return json({ resourceId: `mock-res-${repoName}` });
        }
        case "/api/v1/auth/universal-auth/login": {
          if (!body.clientId || !body.clientSecret) return json({ error: "missing creds" }, 401);
          return json({ accessToken: "mock-infisical-token", tokenType: "Bearer" });
        }
        case "/api/v3/secrets/raw": {
          const auth = req.headers.get("authorization");
          if (auth !== "Bearer mock-infisical-token") return json({ error: "unauthorized" }, 401);
          const env = String(body.environment ?? "");
          const secrets = (body.secrets ?? []) as Array<{ secretKey: string }>;
          calls.infisical.push({ env, keys: secrets.map((s) => s.secretKey) });
          return json({ ok: true });
        }
        default:
          return json({ error: "not found" }, 404);
      }
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    calls,
    stop: () => server.stop(true),
  };
}
