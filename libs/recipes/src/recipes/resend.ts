import type { Recipe, ValidateResult } from "../recipe";

/**
 * validate(): GET https://api.resend.com/domains (Bearer RESEND_API_KEY).
 * A full-access key returns 200 + domain list; a send-only key may 401 here —
 * we fall back to a prefix/format check and report honestly in detail.
 */
export const recipe: Recipe = {
  id: "resend",
  title: "Resend",
  mode: "guided",
  envVars: ["RESEND_API_KEY"],
  tokenCreateUrl: "https://resend.com/api-keys",
  docsUrl: "https://resend.com/docs/introduction",
  requiredScopes: ["Full access (or at minimum Sending access)"],
  rootCredKeys: ["RESEND_API_KEY"],

  async validate(creds: Record<string, string>): Promise<ValidateResult> {
    const key = creds["RESEND_API_KEY"] ?? "";

    if (!key.startsWith("re_")) {
      return {
        ok: false,
        detail: "RESEND_API_KEY must start with 're_' — format check failed (no network call).",
      };
    }

    let res: Response;
    try {
      // Resend: Authorization: Bearer re_…; a full-access key lists /domains (200),
      // a send-only key 401s here → we report that honestly below. There is no
      // token-returning list endpoint. (resend.com/docs/api-reference, verified 2026-07)
      res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch (err) {
      return {
        ok: false,
        detail: `Network error reaching api.resend.com: ${(err as Error).message}`,
      };
    }

    if (res.ok) {
      let domainCount = 0;
      try {
        const body = (await res.json()) as { data?: unknown[] };
        domainCount = Array.isArray(body.data) ? body.data.length : 0;
      } catch {
        // 200 is enough
      }
      return {
        ok: true,
        detail: `Authenticated. ${domainCount} domain(s) visible via /domains.`,
        scopes: ["full-access"],
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        detail:
          `HTTP ${res.status} on GET /domains — key may be send-only (no read scope) or invalid. ` +
          "Prefix 're_' is present.",
        missing: ["full-access (read /domains)"],
      };
    }

    return { ok: false, detail: `Unexpected HTTP ${res.status} from api.resend.com/domains.` };
  },
};

export default recipe;
