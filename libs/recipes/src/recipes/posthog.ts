import type { Recipe, ValidateResult } from "../recipe";

// PostHog recipe — guided mode.
//   NEXT_PUBLIC_POSTHOG_KEY  — the project API key (public, phc_…)
//   NEXT_PUBLIC_POSTHOG_HOST — the ingestion host
//   POSTHOG_PERSONAL_API_KEY — root cred, validation-only, reused across repos.
export const recipe: Recipe = {
  id: "posthog",
  title: "PostHog",
  mode: "guided",
  envVars: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
  rootCredKeys: ["POSTHOG_PERSONAL_API_KEY"],
  tokenCreateUrl: "https://us.posthog.com/settings/user-api-keys",
  docsUrl: "https://posthog.com/docs/api",
  requiredScopes: ["Read project (to validate credentials via /api/projects/)"],

  async validate(creds: Record<string, string>): Promise<ValidateResult> {
    const personalKey = creds["POSTHOG_PERSONAL_API_KEY"];
    const projectKey = creds["NEXT_PUBLIC_POSTHOG_KEY"];

    if (!personalKey) {
      return { ok: false, detail: "POSTHOG_PERSONAL_API_KEY is required to validate" };
    }

    if (projectKey && !projectKey.startsWith("phc_")) {
      return {
        ok: false,
        detail: `NEXT_PUBLIC_POSTHOG_KEY looks wrong — PostHog project keys start with "phc_" (got: ${projectKey.slice(0, 8)}…)`,
      };
    }

    // PostHog: Bearer <personal API key> → GET /api/projects/ lists every project the
    // key can reach (200 valid · 401/403 rejected). The API host must match the account
    // region; derive it from the ingestion host if the user supplied an EU one, else US.
    // (posthog.com/docs/api/personal-api-keys + /api/projects, verified 2026-07)
    const apiHost = (creds["NEXT_PUBLIC_POSTHOG_HOST"] ?? "").includes("eu")
      ? "https://eu.posthog.com"
      : "https://us.posthog.com";

    let res: Response;
    try {
      res = await fetch(`${apiHost}/api/projects/`, {
        headers: { Authorization: `Bearer ${personalKey}` },
      });
    } catch (err) {
      return { ok: false, detail: `Network error: ${(err as Error).message}` };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        detail: `${res.status} — personal API key rejected (invalid or expired)`,
      };
    }
    if (!res.ok) {
      return { ok: false, detail: `Unexpected ${res.status} from PostHog /api/projects/` };
    }

    let body: { results?: Array<{ id: number; name: string }> };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, detail: "PostHog returned non-JSON — unexpected response" };
    }

    const projects = body.results ?? [];
    const projectList = projects.map((p) => p.name).join(", ") || "(none)";
    return {
      ok: true,
      detail: `Authenticated. Accessible projects: ${projectList}`,
      scopes: ["read:projects"],
    };
  },
};

export default recipe;
