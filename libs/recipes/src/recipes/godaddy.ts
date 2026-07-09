import type { Recipe, ValidateResult } from "../recipe";

/**
 * GoDaddy — the domain registrar recipe. Two jobs in the "provision a new project" story:
 *   1. `discover` (a DiscoverySpec row in @ringtail/core's discovery registry) lists the
 *      account's domains VALUE-FREE (names/ids only) so a human can pick which to wire.
 *   2. `buildSetNameserversAction` authors the consequential PUT that points a chosen domain
 *      at Cloudflare's nameservers — the "wire the domain to CF" step of provisioning. It is
 *      a value-free wire action (no key extracted); a human approves it before it runs.
 *
 * Domain TRANSFER is intentionally OUT of scope — nameservers only.
 *
 * Auth: GoDaddy uses `Authorization: sso-key {API_KEY}:{API_SECRET}`, so the connected ROOT is
 * the COMBINED `KEY:SECRET` string and every action's header is `sso-key {{ROOT}}` (the daemon
 * substitutes the whole combined value). TODO(verify): the exact combined-credential format +
 * whether GoDaddy still accepts v1 `sso-key` in 2026 (v2 moved some calls under /v2/customers).
 */

const GODADDY_API = "https://api.godaddy.com";

/**
 * A value-free "point this domain at these nameservers" wire action — the same structural shape
 * as a @ringtail/core `MintAction` (PUT + `{{ROOT}}` header, no `extract` → a wire, not a mint).
 * Typed locally (not imported from core) because recipes sit BELOW core in the boundary graph;
 * the daemon validates it against `MintActionSchema` when the agent submits it, so structural
 * parity is all that's needed.
 */
export interface SetNameserversAction {
  providerAccount: string;
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  body: { nameServers: string[] };
  /** A registrar NS swap is consequential → the human hard-confirms before it runs. */
  danger: "destructive";
}

/**
 * Build the set-nameservers PUT for `domain` → `nameservers` (typically the two
 * `*.ns.cloudflare.com` a CF zone assigns). Value-free: domain + NS names only, no secret.
 *
 * TODO(verify): the exact GoDaddy endpoint for setting nameservers. This uses v1
 * `PUT /v1/domains/{domain}` with a `{ nameServers: [...] }` body (the historically documented
 * shape). GoDaddy has been migrating to v2 (`PUT /v2/customers/{customerId}/domains/{domain}/
 * nameServers`, which needs a customerId) — confirm which is live before shipping against a real
 * account. The allowlist host (`api.godaddy.com`) covers both.
 */
export function buildSetNameserversAction(
  domain: string,
  nameservers: string[],
): SetNameserversAction {
  return {
    providerAccount: "godaddy",
    method: "PUT",
    url: `${GODADDY_API}/v1/domains/${encodeURIComponent(domain)}`,
    headers: { Authorization: "sso-key {{ROOT}}" },
    body: { nameServers: nameservers },
    danger: "destructive",
  };
}

export const recipe: Recipe = {
  id: "godaddy",
  title: "GoDaddy",
  mode: "guided",
  // The project declares its GoDaddy creds as two vars; the connected ROOT combines them
  // (`KEY:SECRET`) for the `sso-key` header. See the file header + the discovery-spec note.
  envVars: ["GODADDY_API_KEY", "GODADDY_API_SECRET"],
  rootCredKeys: ["GODADDY_API_KEY", "GODADDY_API_SECRET"],
  tokenCreateUrl: "https://developer.godaddy.com/keys",
  docsUrl: "https://developer.godaddy.com/doc/endpoint/domains",
  requiredScopes: ["Domains (list + manage nameservers)"],

  /**
   * validate(): GET /v1/domains with the combined `sso-key KEY:SECRET` header — 200 means the
   * credential authenticates and can list domains. TODO(verify): shape + status semantics.
   */
  async validate(creds: Record<string, string>): Promise<ValidateResult> {
    const key = creds["GODADDY_API_KEY"];
    const secret = creds["GODADDY_API_SECRET"];
    if (!key || !secret) {
      return { ok: false, detail: "GODADDY_API_KEY and GODADDY_API_SECRET are both required" };
    }
    let res: Response;
    try {
      res = await fetch(`${GODADDY_API}/v1/domains`, {
        headers: { Authorization: `sso-key ${key}:${secret}` },
      });
    } catch (err) {
      return {
        ok: false,
        detail: `Network error reaching api.godaddy.com: ${(err as Error).message}`,
      };
    }
    if (res.ok) {
      let count = 0;
      try {
        const body = (await res.json()) as unknown[];
        count = Array.isArray(body) ? body.length : 0;
      } catch {
        /* 200 is enough */
      }
      return {
        ok: true,
        detail: `Authenticated — ${count} domain(s) visible`,
        scopes: ["domains"],
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        detail: `HTTP ${res.status} — invalid or unauthorized GoDaddy key/secret`,
      };
    }
    return { ok: false, detail: `Unexpected HTTP ${res.status} from api.godaddy.com/v1/domains` };
  },
};

export default recipe;
