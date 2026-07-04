import type { Recipe, ValidateResult, ProvisionCtx } from "../recipe";

const CF_BASE = "https://api.cloudflare.com/client/v4";

/**
 * The required scopes, as a SINGLE source of truth. Each entry carries:
 *   - `label`  the human-readable scope (shown to the user, → `requiredScopes`)
 *   - `key`    Cloudflare's permission-group KEY for the token-template deep-link
 *   - `type`   the access level (`read` | `edit`)
 *   - `probe`  a GET path that requires this permission group — validate-after-mint
 *              hits it and reads the HTTP verdict (200 granted · 403 missing).
 *
 * Keys + template-URL format are the OFFICIAL Cloudflare "API token template URLs"
 * (developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template).
 * The keys: page · workers_scripts · workers_kv_storage · workers_r2 · dns ·
 * account_settings. Verified current 2026-07.
 */
interface CfScope {
  label: string;
  key: string;
  type: "read" | "edit";
  /** GET path proving this scope; null → can't probe without an account id. */
  probe: (accountId?: string) => string | null;
}

const CF_SCOPES: CfScope[] = [
  {
    label: "Account Settings: Read",
    key: "account_settings",
    type: "read",
    probe: () => "/accounts?per_page=1",
  },
  {
    label: "Cloudflare Pages: Edit",
    key: "page",
    type: "edit",
    probe: (a) => (a ? `/accounts/${a}/pages/projects?per_page=1` : null),
  },
  {
    label: "Workers Scripts: Edit",
    key: "workers_scripts",
    type: "edit",
    probe: (a) => (a ? `/accounts/${a}/workers/scripts` : null),
  },
  {
    label: "Workers KV Storage: Edit",
    key: "workers_kv_storage",
    type: "edit",
    probe: (a) => (a ? `/accounts/${a}/storage/kv/namespaces?per_page=1` : null),
  },
  {
    label: "Workers R2 Storage: Edit",
    key: "workers_r2",
    type: "edit",
    probe: (a) => (a ? `/accounts/${a}/r2/buckets` : null),
  },
  { label: "DNS: Edit", key: "dns", type: "edit", probe: () => "/zones?per_page=1" },
];

/**
 * Build the pre-scoped token-creation deep-link (open-url step). Uses CF's official
 * user-token template URL: `permissionGroupKeys` pre-selects every permission group,
 * `accountId=*` + `zoneId=all` pre-scope the resources, `name` pre-fills the label.
 * The user only clicks "Create" + copies the token — no scope hunting.
 * Pure + deterministic → unit-tested.
 */
export function buildTokenCreateUrl(name = "ringtail"): string {
  const permissionGroupKeys = CF_SCOPES.map((s) => ({ key: s.key, type: s.type }));
  const params = new URLSearchParams({
    permissionGroupKeys: JSON.stringify(permissionGroupKeys),
    accountId: "*",
    zoneId: "all",
    name,
  });
  return `https://dash.cloudflare.com/profile/api-tokens?${params.toString()}`;
}

export interface VerifyOutcome {
  active: boolean;
  status?: string;
  tokenId?: string;
  detail: string;
}

/** Parse `GET /user/tokens/verify` (status ∈ active|disabled|expired). Pure → tested. */
export function parseVerify(httpStatus: number, body: unknown): VerifyOutcome {
  if (httpStatus === 0) {
    return { active: false, detail: "network error — could not reach api.cloudflare.com" };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { active: false, detail: `${httpStatus} invalid or revoked token` };
  }
  const b = body as {
    success?: boolean;
    result?: { status?: string; id?: string };
    errors?: Array<{ message?: string }>;
  };
  if (!b?.success) {
    const msg =
      (b?.errors ?? [])
        .map((e) => e.message)
        .filter(Boolean)
        .join("; ") || `unexpected HTTP ${httpStatus}`;
    return { active: false, detail: msg };
  }
  const status = b.result?.status;
  if (status !== "active") {
    return {
      active: false,
      status,
      detail: `token status is '${status ?? "unknown"}' (expected 'active')`,
    };
  }
  return { active: true, status, tokenId: b.result?.id, detail: "token active" };
}

export type ProbeVerdict = "granted" | "missing" | "unknown";

/**
 * Classify a scope-probe response. 200 = the token can reach the resource (scope
 * granted); 403 (or CF authz code 9109 "Unauthorized to access requested resource")
 * = the permission group is missing → the PRECISE wrong-scope signal; anything else
 * (5xx, network) = inconclusive, don't false-flag a transient error as wrong-scope.
 * Pure → tested with fixtures.
 */
export function classifyProbe(httpStatus: number, body: unknown): ProbeVerdict {
  if (httpStatus === 200) return "granted";
  if (httpStatus === 403) return "missing";
  const b = body as { errors?: Array<{ code?: number }> };
  if ((b?.errors ?? []).some((e) => e.code === 9109)) return "missing";
  return "unknown";
}

/** Partition probe verdicts into granted/missing/unknown scope labels. Pure → tested. */
export function summarizeScopes(probes: Array<{ label: string; verdict: ProbeVerdict }>): {
  scopes: string[];
  missing: string[];
  unknown: string[];
} {
  const scopes: string[] = [];
  const missing: string[] = [];
  const unknown: string[] = [];
  for (const p of probes) {
    if (p.verdict === "granted") scopes.push(p.label);
    else if (p.verdict === "missing") missing.push(p.label);
    else unknown.push(p.label);
  }
  return { scopes, missing, unknown };
}

async function cfGet(
  path: string,
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(`${CF_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

export const recipe: Recipe = {
  id: "cloudflare",
  title: "Cloudflare",
  mode: "guided",
  envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
  // Pre-scoped deep-link — the open-url step drops the user on a token page with
  // every required permission group already ticked.
  tokenCreateUrl: buildTokenCreateUrl(),
  docsUrl: "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
  requiredScopes: CF_SCOPES.map((s) => s.label),
  // The API token is the ONLY root cred the user pastes; ACCOUNT_ID is derived from
  // it at validate/provision time (GET /accounts) — no second copy-paste.
  rootCredKeys: ["CLOUDFLARE_API_TOKEN"],

  /**
   * Validate-AFTER-mint against REAL Cloudflare:
   *  1. GET /user/tokens/verify → token is active (not disabled/expired/revoked).
   *  2. GET /accounts           → resolve the account id + probe Account Settings:Read.
   *  3. one scoped probe per required permission group → 403 = precisely-named gap.
   * `ok` iff the token is active AND no probe came back missing.
   */
  async validate(creds): Promise<ValidateResult> {
    const token = creds["CLOUDFLARE_API_TOKEN"];
    if (!token) return { ok: false, detail: "CLOUDFLARE_API_TOKEN is missing" };

    const verify = await cfGet("/user/tokens/verify", token);
    const vo = parseVerify(verify.status, verify.body);
    if (!vo.active) return { ok: false, detail: vo.detail };

    // Account Settings:Read probe doubles as account-id resolution.
    const accountsRes = await cfGet("/accounts?per_page=50", token);
    const accountsBody = accountsRes.body as { result?: Array<{ id: string; name: string }> };
    const accountList = accountsBody?.result ?? [];
    const suppliedId = creds["CLOUDFLARE_ACCOUNT_ID"];
    const account = suppliedId ? accountList.find((a) => a.id === suppliedId) : accountList[0];
    const accountId = account?.id ?? suppliedId;

    if (suppliedId && accountsRes.status === 200 && !account) {
      return {
        ok: false,
        detail: `CLOUDFLARE_ACCOUNT_ID '${suppliedId}' not found in accessible accounts`,
        scopes: [],
        missing: [],
      };
    }

    const probes: Array<{ label: string; verdict: ProbeVerdict }> = [];
    for (const s of CF_SCOPES) {
      if (s.key === "account_settings") {
        probes.push({
          label: s.label,
          verdict: classifyProbe(accountsRes.status, accountsRes.body),
        });
        continue;
      }
      const path = s.probe(accountId);
      if (!path) {
        probes.push({ label: s.label, verdict: "unknown" });
        continue;
      }
      const r = await cfGet(path, token);
      probes.push({ label: s.label, verdict: classifyProbe(r.status, r.body) });
    }

    // ponytail: a GET probe confirms the resource is REACHABLE (Edit groups include
    //   Read), so a Read-only token to the same resource reads as granted. The gap it
    //   catches precisely is NO access (403) — the wrong-scope case that matters.
    //   Upgrade path: a dry-run write per scope when a false "Read passes for Edit" bites.
    const { scopes, missing, unknown } = summarizeScopes(probes);
    const acctSummary = account
      ? `account '${account.name}' (${account.id})`
      : `${accountList.length} account(s) accessible`;
    const ok = missing.length === 0;
    return {
      ok,
      detail: ok
        ? `authenticated — token active, ${acctSummary}${unknown.length ? ` · unverified: ${unknown.join(", ")}` : ""}`
        : `token active but missing scope(s): ${missing.join(", ")}`,
      scopes,
      missing,
    };
  },

  async autoProvision(
    creds: Record<string, string>,
    ctx: ProvisionCtx,
  ): Promise<Record<string, string>> {
    const token = creds["CLOUDFLARE_API_TOKEN"];
    if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");

    let accountId = creds["CLOUDFLARE_ACCOUNT_ID"];
    if (!accountId) {
      ctx.log("Resolving Cloudflare account id…");
      const accounts = await cfGet("/accounts?per_page=1", token);
      if (!accounts.ok) {
        throw new Error(
          `Cannot list accounts (${accounts.status}). Check Account Settings:Read scope.`,
        );
      }
      const data = accounts.body as { result?: Array<{ id: string; name: string }> };
      const first = data?.result?.[0];
      if (!first) throw new Error("No Cloudflare accounts found for this token");
      accountId = first.id;
      ctx.log(`Using account '${first.name}' (${accountId})`);
    }

    const projectName = ctx.repoName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 58);

    ctx.log(`Creating Pages project '${projectName}'…`);

    let res: { ok: boolean; status: number; body: unknown };
    try {
      const raw = await fetch(`${CF_BASE}/accounts/${accountId}/pages/projects`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, production_branch: "main" }),
      });
      const body = await raw.json();
      res = { ok: raw.ok, status: raw.status, body };
    } catch (err) {
      throw new Error(`Network error creating Pages project: ${String(err)}`);
    }

    if (!res.ok) {
      const errBody = res.body as { errors?: Array<{ message: string; code: number }> };
      const cfErrors = errBody?.errors ?? [];
      const alreadyExists = cfErrors.some((e) => e.code === 8000000);
      if (alreadyExists) {
        ctx.log(`Pages project '${projectName}' already exists — reusing it.`);
      } else {
        const msg = cfErrors.map((e) => e.message).join("; ") || res.status.toString();
        throw new Error(`Failed to create Pages project: ${msg}`);
      }
    } else {
      ctx.log(`Pages project '${projectName}' created.`);
    }

    return {
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_PAGES_PROJECT_NAME: projectName,
    };
  },
};

export default recipe;
