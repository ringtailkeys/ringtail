import { randomBytes } from "node:crypto";
import { syncCredential, type Environment } from "@ringtail/sinks";
import { discoverCredentials, putCredential, resolveRoot } from "@ringtail/store";
import { z } from "zod";
import { hostAllowed, hostOf, providerOf } from "./allowlist";
import { DangerSchema, type PendingMint } from "./wizard";

/**
 * The GENERIC action executor — the heart of the dynamic mint engine. There is NO
 * per-provider code here: the agent AUTHORS an HTTP action at runtime, the daemon
 * runs it with the root key it holds, and every provider (mint · permission-check ·
 * wire) walks this ONE path. The mock provider is just an allowlisted test host.
 *
 * THE GUARANTEE (enforced): this function NEVER returns a secret value (root or
 * minted). It returns `{ providerAccount, varName?, status, reason? }` — names +
 * status only. The root key leaves the daemon ONLY substituted into an outbound
 * call to an allowlisted provider host; anything else is rejected before any HTTP.
 */

const ROOT_PLACEHOLDER = "{{ROOT}}";

/**
 * The agent-authored action. `headers` may carry `{{ROOT}}` — the daemon
 * substitutes the resolved root key at send time. `extract` (optional) names the
 * minted secret to pull from the response and the env-var to file it under; absent
 * `extract` = a read-only permission-check or a side-effecting wire action.
 */
export const MintActionSchema = z.object({
  /** `provider` or `provider:account` — the vault key AND the allowlist lookup. */
  providerAccount: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  /** MUST be an allowlisted host for `providerAccount` (checked before any call). */
  url: z.string().url(),
  /** Header values may contain `{{ROOT}}` (substituted with the root key). */
  headers: z.record(z.string()).optional(),
  /** JSON request body (sent as application/json). */
  body: z.unknown().optional(),
  /** Pull the minted secret from the JSON response and file it under `varName`. */
  extract: z
    .object({
      /** A real env-var name only — the charset check keeps a crafted `varName` from
       * injecting a `\n`/`=` extra line into the .env.local sink (clean, one-var-per-line). */
      varName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "varName must be a valid env-var name"),
      /** Dot-path into the JSON response, e.g. `token` or `data.api_key`. */
      path: z.string().min(1),
    })
    .optional(),
  /** `confirm`/`destructive` require an explicit `confirmed:true` to run (approve
   * gate). Omitted / `safe` = auto-run (read-only permission checks never nag). */
  danger: DangerSchema.optional(),
});
export type MintAction = z.infer<typeof MintActionSchema>;

/** A value-free execution result — names + status only, NEVER a secret value. */
export interface MintResult {
  providerAccount: string;
  /** The env-var name written (mint) — never its value. */
  varName?: string;
  status: "minted" | "reused" | "ok" | "rejected" | "needs-confirm" | "no-root" | "failed";
  /** Plain-language cause (allowlist reject, missing scope, rate-limit…). No value. */
  reason?: string;
  /** Public correlation id for a parked (`needs-confirm`) consequential mint. NOT the
   * nonce — the agent gets this; the unforgeable nonce goes to the dashboard only. */
  id?: string;
}

export interface MintOpts {
  repoName: string;
  env: Environment;
  envLocalPath?: string;
  /** The human's hard-confirm for a consequential action. NEVER settable by the agent:
   * the MCP `mintKey` tool routes through `proposeMintAction` (which drops it); this is
   * flipped `true` ONLY by `approveMintAction` after a nonce-carrying human approve. */
  confirmed?: boolean;
}

/**
 * ALL root-spending writes are consequential — DERIVED server-side, never trusted from
 * the agent's self-declared `danger` (which may only ESCALATE, never downgrade):
 *   - DELETE / PUT / PATCH always spend the root key destructively (delete/rotate).
 *   - a POST that substitutes `{{ROOT}}` creates/rotates with the root key.
 *   - an explicit `danger !== 'safe'` escalates anything else (e.g. a flagged GET).
 * A GET, or a POST that does NOT touch `{{ROOT}}` (a probe), stays auto-run. So a
 * `danger:'safe'` on a real write is OVERRIDDEN — safe can never downgrade a write.
 */
export function isConsequential(action: MintAction): boolean {
  const write =
    action.method === "DELETE" ||
    action.method === "PUT" ||
    action.method === "PATCH" ||
    (action.method === "POST" && usesRoot(action));
  return write || (action.danger !== undefined && action.danger !== "safe");
}

/** The audit name a minted key is filed under so it can be found + revoked later
 * (PRD §"Audit naming"): `ringtail/<repo>/<env>/<provider>`. The agent puts this in
 * the provider create-call body; we also stamp it as the stored key's provenance. */
export function auditName(repoName: string, env: Environment, providerAccount: string): string {
  return `ringtail/${repoName}/${env}/${providerOf(providerAccount)}`;
}

/** Does any header reference the root placeholder? (drives the no-root check). */
function usesRoot(action: MintAction): boolean {
  return Object.values(action.headers ?? {}).some((v) => v.includes(ROOT_PLACEHOLDER));
}

/** Substitute the root key into `{{ROOT}}` header slots. */
function resolveHeaders(headers: Record<string, string>, root: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, v.split(ROOT_PLACEHOLDER).join(root)]),
  );
}

/** Walk a dot-path into a parsed JSON value; undefined if any hop is missing. */
function pluck(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Reject header names/values carrying control chars (CR/LF/NUL/…) BEFORE the root is
 * ever resolved or substituted. Two jobs: (1) a CRLF in an authored value is header
 * injection; (2) once `{{ROOT}}` is substituted, an illegal byte makes Bun's `Headers`
 * ctor throw SYNCHRONOUSLY with the FULL (root-bearing) value in the message — which
 * would otherwise ride out to the agent in a `reason`. Rejecting the raw authored value
 * up front means the root is never resolved and the throw never happens.
 */
// A control char is any code point ≤ 0x1f (incl. CR 0x0d / LF 0x0a / NUL) or DEL 0x7f.
// A char-code scan, not a regex literal — control chars in a regex trip no-control-regex.
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}
function illegalHeader(headers: Record<string, string>): string | null {
  for (const [k, v] of Object.entries(headers)) {
    if (hasControlChar(k) || hasControlChar(v)) {
      // Sanitise the key in the message too (a control char in the NAME must not echo).
      return `illegal control character in header '${hasControlChar(k) ? "(name)" : k}'`;
    }
  }
  return null;
}

/**
 * The structural floor: rejects that MUST fire before the root key is resolved OR the
 * action is ever parked for approval — a non-allowlisted host, or a control-char header.
 * Shared by `executeMintAction` (gates 1 + 1b) and `proposeMintAction` so a doomed
 * action rejects immediately instead of nagging a human to approve garbage.
 */
function structuralReject(action: MintAction): MintResult | null {
  // 1. allowlist floor — reject before resolving a root key or making any call.
  if (!hostAllowed(action.providerAccount, action.url)) {
    return {
      providerAccount: action.providerAccount,
      status: "rejected",
      reason: `host not allowlisted for ${providerOf(action.providerAccount)}: ${hostOf(action.url)}`,
    };
  }
  // 1b. header hygiene — reject a control char in any authored header BEFORE the root
  //     is resolved. Stops CRLF header-injection AND the Bun `Headers`-throws-with-the-
  //     substituted-value leak (the root can't ride out in an exception `reason`).
  const bad = illegalHeader(action.headers ?? {});
  if (bad) return { providerAccount: action.providerAccount, status: "rejected", reason: bad };
  return null;
}

/**
 * THE GUARANTEE at the last inch: redact any known secret VALUE (root or minted) from
 * an outgoing `reason` before it leaves the daemon. Even if a provider mirrors our
 * Authorization header into its error body, or a lower layer embeds the substituted
 * value in an exception message, the value is scrubbed here — the reason carries the
 * cause, never the secret. Belt to the header-validation braces.
 */
function scrub(reason: string, secrets: string[]): string {
  let out = reason;
  for (const s of secrets) {
    if (s) out = out.split(s).join("[redacted]");
  }
  return out;
}

/**
 * Run one agent-authored action end-to-end. Gate order is deliberate:
 *   1. allowlist — the structural floor: a non-allowlisted host is REJECTED before
 *      the root key is even resolved, so it can never leave toward an arbitrary URL.
 *   2. approve — a `confirm`/`destructive` action refuses to run without `confirmed`.
 *   3. idempotency — a minted key already on disk/in the vault is REUSED, not re-minted.
 *   4. resolve root — a `{{ROOT}}`-using action with no stored root → `no-root` recovery.
 *   5. HTTP — substitute the root, call the (allowlisted) host.
 *   6. extract → sink — file the minted value under its env-var; return the NAME only.
 */
export async function executeMintAction(action: MintAction, opts: MintOpts): Promise<MintResult> {
  const { providerAccount } = action;

  // 1 + 1b. the structural floor — a non-allowlisted host or a control-char header is
  //         REJECTED before the root key is resolved or any HTTP happens.
  const rejected = structuralReject(action);
  if (rejected) return rejected;

  // 2. approve gate — a consequential action never runs here without `confirmed`. The
  //    broad "is this a root-spending write?" decision (isConsequential) lives at the
  //    agent boundary in `proposeMintAction`, which parks it for a human. This inner
  //    gate is the last-inch floor: even if reached directly, a DELETE (or an explicit
  //    `danger`) refuses to run un-confirmed. `approveMintAction` sets `confirmed:true`.
  const consequential = action.method === "DELETE" || (action.danger && action.danger !== "safe");
  if (consequential && !opts.confirmed) {
    return {
      providerAccount,
      status: "needs-confirm",
      reason: `confirm required (${action.danger ?? action.method}) before running`,
    };
  }

  // 3. idempotency — reuse an already-provisioned key instead of duplicating it.
  if (action.extract) {
    const [hit] = discoverCredentials([action.extract.varName], {
      envLocalPath: opts.envLocalPath,
    });
    if (hit) {
      return {
        providerAccount,
        varName: action.extract.varName,
        status: "reused",
        reason: `${action.extract.varName} already provisioned (${hit.source}) — reused, not re-minted`,
      };
    }
  }

  // 4. resolve the root key (only required when a header references {{ROOT}}).
  const root = resolveRoot(providerAccount);
  if (usesRoot(action) && !root) {
    return {
      providerAccount,
      status: "no-root",
      reason: `no root key stored for ${providerAccount} — paste one in the dashboard first`,
    };
  }
  // Known secret VALUES to redact from any provider/exception-derived reason before it
  // leaves the daemon (defence in depth behind the header-hygiene reject above).
  const secrets = root ? [root] : [];
  const headers: Record<string, string> = {
    ...(action.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...resolveHeaders(action.headers ?? {}, root ?? ""),
  };

  // 5. the HTTP call — the ONLY place the root key leaves the daemon, toward the
  //    allowlisted host verified in gate 1. `redirect: "manual"` so a 3xx from an
  //    allowlisted host can NEVER carry the root key to an off-allowlist Location:
  //    fetch does not re-check the hop, so we refuse to follow it (a redirect = failed).
  let res: Response;
  try {
    res = await fetch(action.url, {
      method: action.method,
      headers,
      body: action.body !== undefined ? JSON.stringify(action.body) : undefined,
      redirect: "manual",
    });
  } catch (err) {
    return {
      providerAccount,
      status: "failed",
      reason: scrub(`network error: ${(err as Error).message}`, secrets),
    };
  }

  // A redirect off the allowlisted host is NOT followed — the root would ride the
  // re-issued request to whatever Location the provider returned (open-redirect exfil).
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    return {
      providerAccount,
      status: "failed",
      reason: "provider returned a redirect — not followed (off-allowlist hop blocked)",
    };
  }

  if (!res.ok) {
    // Plain-language recovery cause (Layer 4) — a scope gap reads as a scope gap.
    const gap =
      res.status === 401 || res.status === 403
        ? "root key lacks the required permission/scope"
        : `provider returned HTTP ${res.status}`;
    let detail = "";
    try {
      const b = (await res.json()) as { error?: string; message?: string };
      detail = b.error ?? b.message ?? "";
    } catch {
      /* non-JSON body — status is enough */
    }
    // Scrub: a provider that reflects our Authorization header / a submitted field into
    // its error body can echo the root back — it must never survive into the reason.
    return {
      providerAccount,
      status: "failed",
      reason: scrub(detail ? `${gap}: ${detail}` : gap, secrets),
    };
  }

  // 6. no extract → a permission-check / wire action succeeded (no key to file).
  if (!action.extract) return { providerAccount, status: "ok" };

  // extract the minted secret → sink (.env.local for local, Infisical for deployed).
  let value: unknown;
  try {
    value = pluck(await res.json(), action.extract.path);
  } catch {
    return { providerAccount, status: "failed", reason: "response was not JSON — cannot extract" };
  }
  if (value === undefined || value === null || value === "") {
    return {
      providerAccount,
      status: "failed",
      reason: `extract path '${action.extract.path}' not found in response`,
    };
  }

  const varName = action.extract.varName;
  const minted = String(value);
  await syncCredential(varName, minted, { env: opts.env, envLocalPath: opts.envLocalPath });
  // Persist to the vault with the audit name as provenance (find + revoke later).
  putCredential(varName, {
    value: minted,
    provider: auditName(opts.repoName, opts.env, providerAccount),
    updatedAt: new Date().toISOString(),
  });
  return { providerAccount, varName, status: "minted" };
}

/**
 * The parked-mint registry — the UNFORGEABLE human-confirm channel for `mintKey`.
 * A consequential action the agent proposes is stashed here under a server-generated
 * nonce; it executes ONLY when a human posts that nonce back via POST /api/action. The
 * agent never receives the nonce (only the dashboard does, over SSE), so the agent that
 * authored the action cannot self-approve it — closing the "agent sets confirmed:true"
 * hole. Keyed by nonce.
 * ponytail: module-level Map — the daemon is one process, one store. A restart drops
 * pending approvals (the agent just re-proposes), which is the correct fail-safe for a
 * security gate; persist them only if approvals must survive a crash.
 */
const pendingMints = new Map<string, { action: MintAction; opts: MintOpts }>();

export interface ProposeResult {
  /** The value-free result handed to the AGENT — carries the public `id`, NEVER the nonce. */
  result: MintResult;
  /** Present ONLY when parked: the daemon routes this to the dashboard SSE (never the agent). */
  pending?: PendingMint;
}

/**
 * The agent PROPOSES an action (the MCP `mintKey` entry). A read-only / non-`{{ROOT}}`
 * probe auto-runs now. A consequential root-spending write (isConsequential) is PARKED
 * under a fresh server nonce and returned as `needs-confirm` — NO execution, and the
 * nonce is NOT in the agent-facing result. Any `opts.confirmed` an agent smuggles in is
 * deliberately DROPPED here, so the MCP tool can never self-approve. A structurally
 * doomed action (bad host / header) still rejects immediately rather than nagging.
 */
export async function proposeMintAction(
  action: MintAction,
  opts: MintOpts,
): Promise<ProposeResult> {
  const rejected = structuralReject(action);
  if (rejected) return { result: rejected };
  if (!isConsequential(action)) {
    // Not a write → run it now, but never honor an agent-supplied confirm.
    return { result: await executeMintAction(action, { ...opts, confirmed: false }) };
  }
  const id = randomBytes(6).toString("hex");
  const nonce = randomBytes(24).toString("hex");
  pendingMints.set(nonce, { action, opts });
  const pending: PendingMint = {
    id,
    nonce,
    providerAccount: action.providerAccount,
    method: action.method,
    danger: action.danger,
    varName: action.extract?.varName,
  };
  return {
    pending,
    result: {
      providerAccount: action.providerAccount,
      status: "needs-confirm",
      id,
      reason: `human approval required (${action.danger ?? action.method}) — approve in the dashboard`,
    },
  };
}

/**
 * The HUMAN approves a parked mint by posting its server nonce to POST /api/action. The
 * agent never received the nonce, so it cannot forge this. An unknown or already-used
 * nonce is rejected (never executes). On a hit the parked action runs with the ONE
 * `confirmed:true` the system ever sets.
 */
export async function approveMintAction(nonce: string): Promise<MintResult> {
  const parked = nonce ? pendingMints.get(nonce) : undefined;
  if (!parked) {
    return { providerAccount: "", status: "rejected", reason: "unknown or already-used approval" };
  }
  pendingMints.delete(nonce);
  return executeMintAction(parked.action, { ...parked.opts, confirmed: true });
}
