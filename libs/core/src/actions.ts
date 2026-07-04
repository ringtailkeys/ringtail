/**
 * Typed cross-tool ACTION executors — layer 2's differentiator (architecture.md
 * §"Map the actions"). An action is NOT a credential-provisioning loop; it's a
 * concrete operation the agent triggers and the daemon EXECUTES with the already-
 * stored root creds (orchestrate-vs-execute). It returns STATUS + public,
 * non-secret facts (e.g. the nameservers it set) — NEVER a secret value.
 *
 * The first executor: domain→CF ("point the domain's nameservers at Cloudflare").
 * It is `destructive` — an NS swap cuts over live DNS — so the daemon HARD-CONFIRMS
 * before ever calling this (never one-click); this function only does the deed.
 */

/** A value-free action outcome. `changes` are PUBLIC records (DNS nameservers are
 * not secrets); no credential value ever appears here. */
export interface ActionResult {
  action: string;
  status: "done" | "failed";
  detail: string;
  /** Public before/after facts the operation changed (non-secret). */
  changes?: Array<{ field: string; from: string; to: string }>;
}

/** Cloudflare hands every zone a deterministic pair of assigned nameservers. The
 * fake mirrors that shape (real value comes from the CF zone API in P5). */
const CLOUDFLARE_NS = ["aria.ns.cloudflare.com", "carter.ns.cloudflare.com"] as const;

/**
 * domain→CF — repoint the registrar's nameservers at Cloudflare so CF becomes the
 * authoritative DNS. Reuses the ported GoDaddy(registrar)+CF NS-swap shape:
 *   1. read the zone's CF-assigned nameservers (CF zone API),
 *   2. PATCH the registrar's domain record to those nameservers.
 * ponytail: deterministic fake registrar + CF (no network) — the prerequisite gate
 * (cloudflare connected) lives in the daemon's runAction. Wire the real GoDaddy
 * PATCH /v1/domains/{domain} + CF GET /zones (Context7 live docs) in P5.
 */
export async function executeDomainToCf(opts: { domain?: string } = {}): Promise<ActionResult> {
  const domain = opts.domain ?? "example.com";
  // The registrar's current (pre-swap) nameservers — a parked-domain default.
  const from = "ns1.registrar.example · ns2.registrar.example";
  const to = CLOUDFLARE_NS.join(" · ");
  return {
    action: "domain-to-cf",
    status: "done",
    detail: `${domain}: nameservers repointed to Cloudflare (DNS now authoritative on CF).`,
    changes: [{ field: `${domain} nameservers`, from, to }],
  };
}

/** The typed-executor registry — dispatch key (Action.executor) → executor. The
 * daemon looks an action up here; a miss falls back to the provisioning loop. */
export const ACTION_EXECUTORS: Record<
  string,
  (opts?: { domain?: string }) => Promise<ActionResult>
> = {
  "domain-to-cf": executeDomainToCf,
};
