import type { Recipe, ValidateResult } from "../recipe";

/**
 * Creem recipe — guided mode. validate(): GET /v1/products/search (a safe read-only
 * list) authenticated with the `x-api-key` header (Creem does NOT use Bearer). 200 →
 * ok; 401/403 → not ok. Otherwise falls back to a prefix/format check and says so.
 * CREEM_WEBHOOK_SECRET is local — we only check it's present.
 * (docs.creem.io/api-reference/introduction + endpoint/search-products, verified 2026-07)
 */
const CREEM_API_BASE = "https://api.creem.io";
const KEY_PREFIXES = ["creem_live_", "creem_test_", "creem_"];

export const recipe: Recipe = {
  id: "creem",
  title: "Creem",
  mode: "guided",
  envVars: ["CREEM_API_KEY", "CREEM_WEBHOOK_SECRET"],
  tokenCreateUrl: "https://dashboard.creem.io/settings/api-keys",
  docsUrl: "https://docs.creem.io",
  requiredScopes: ["Read products / customers (minimum read scope)"],
  rootCredKeys: ["CREEM_API_KEY"],

  async validate(creds: Record<string, string>): Promise<ValidateResult> {
    const apiKey = creds["CREEM_API_KEY"] ?? "";
    const webhookSecret = creds["CREEM_WEBHOOK_SECRET"] ?? "";

    if (!apiKey) return { ok: false, detail: "CREEM_API_KEY is missing." };
    if (!webhookSecret) return { ok: false, detail: "CREEM_WEBHOOK_SECRET is missing." };

    let res: Response;
    try {
      res = await fetch(`${CREEM_API_BASE}/v1/products/search?page_size=1`, {
        method: "GET",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      });
    } catch (err) {
      const hasKnownPrefix = KEY_PREFIXES.some((p) => apiKey.startsWith(p));
      return {
        ok: false,
        detail: `Network error reaching Creem API (${String(err)}). Key format check: ${
          hasKnownPrefix ? "prefix looks valid" : "unrecognised prefix — double-check your key"
        }. CREEM_WEBHOOK_SECRET present.`,
      };
    }

    if (res.ok) {
      return {
        ok: true,
        detail: `Authenticated — GET /v1/products/search returned ${res.status}. CREEM_WEBHOOK_SECRET present.`,
        scopes: ["products:read"],
      };
    }

    if (res.status === 401 || res.status === 403) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        // ignore
      }
      return {
        ok: false,
        detail:
          `Creem API returned ${res.status} — invalid or revoked key. ${body ? `Response: ${body.slice(0, 200)}` : ""}`.trim(),
      };
    }

    // ponytail: honest degradation — no safe GET confirmed; format check only.
    const hasKnownPrefix = KEY_PREFIXES.some((p) => apiKey.startsWith(p));
    return {
      ok: false,
      detail:
        `Creem API returned unexpected status ${res.status} on GET /v1/products/search. ` +
        `Falling back to key-format check: ${
          hasKnownPrefix ? "prefix looks valid" : "unrecognised key prefix — verify your key"
        }. CREEM_WEBHOOK_SECRET present.`,
    };
  },
};

export default recipe;
