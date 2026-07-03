import type { Recipe, ValidateResult, ProvisionCtx } from "../recipe";

/**
 * The MOCK provider recipe — the key to a flawless, offline, deterministic e2e.
 * It talks to a self-contained fake HTTP provider (see @ringtail/core's
 * mock-provider) whose URL is `MOCK_PROVIDER_URL`. The fake exposes:
 *   POST /oauth/token   → mint a scoped token (grant: 'full' | 'partial')
 *   POST /validate      → echo the scopes a token actually carries
 *   POST /provision     → create the fake resource, return its id
 *
 * `makeMockRecipe` produces two instances so the e2e can exercise BOTH paths
 * from one fixture:
 *   - grant 'full'    → token carries [read, write] → validates → provisions → syncs
 *   - grant 'partial' → token carries [read] only   → wrong-scope, flagged, no sync
 * No real cloud accounts, no randomness — same input, same output, every run.
 */
const REQUIRED_SCOPES = ["read", "write"];

function base(): string {
  const url = process.env.MOCK_PROVIDER_URL;
  if (!url) throw new Error("MOCK_PROVIDER_URL is not set — start the mock provider first");
  return url.replace(/\/$/, "");
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`mock provider ${path} → HTTP ${res.status}`);
  return res.json();
}

export function makeMockRecipe(id: string, grant: "full" | "partial"): Recipe {
  return {
    id,
    title: `Mock Provider (${grant})`,
    mode: "auto",
    envVars: ["MOCK_API_KEY", "MOCK_RESOURCE_ID"],
    requiredScopes: REQUIRED_SCOPES,
    rootCredKeys: ["MOCK_API_KEY"],

    // mint (scoped token) — the OAuth token endpoint hands back a token whose
    // granted scopes depend on the consent we requested.
    async mint(): Promise<Record<string, string>> {
      const { token } = (await post("/oauth/token", { grant })) as { token: string };
      return { MOCK_API_KEY: token };
    },

    // validate-AFTER-mint: probe what the minted token can actually do.
    async validate(creds: Record<string, string>): Promise<ValidateResult> {
      const token = creds["MOCK_API_KEY"];
      if (!token) return { ok: false, detail: "MOCK_API_KEY missing (mint first)" };
      const { scopes } = (await post("/validate", { token })) as { scopes: string[] };
      const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
      return {
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? `token carries all required scopes`
            : `token missing scope(s): ${missing.join(", ")}`,
        scopes,
        missing,
      };
    },

    async autoProvision(
      creds: Record<string, string>,
      ctx: ProvisionCtx,
    ): Promise<Record<string, string>> {
      const token = creds["MOCK_API_KEY"];
      if (!token) throw new Error("MOCK_API_KEY required to provision");
      ctx.log(`Provisioning mock resource for ${ctx.repoName}…`);
      const { resourceId } = (await post("/provision", {
        token,
        repoName: ctx.repoName,
      })) as { resourceId: string };
      return { MOCK_API_KEY: token, MOCK_RESOURCE_ID: resourceId };
    },
  };
}

/** Good path — validates, provisions, syncs. */
export const mockRecipe = makeMockRecipe("mock", "full");
/** Failure path — token under-scoped, caught at validate as wrong-scope. */
export const mockBadScopeRecipe = makeMockRecipe("mock-badscope", "partial");
