import { randomBytes } from "node:crypto";
import { syncCredential, type Environment } from "@ringtail/sinks";
import {
  appendRotation,
  discoverCredentials,
  listRootsFor,
  putCredential,
  readStore,
  resolveRoot,
  resolveRootById,
} from "@ringtail/store";
import { z } from "zod";
import { hostAllowed, hostOf, providerOf } from "./allowlist";
import { getDiscoverySpec, type MintChoices, type MintSelection } from "./discovery";
import { resolveGrantToken } from "./oauth";
import { type RotationEffects, type RotationOutcome, runRotation } from "./rotate";
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
 * GUIDED least-privilege placeholders (PRD §4.5). The agent authors a SCOPED-mint template
 * carrying these where the human's steered choices go; the daemon substitutes them from the
 * approved selection at run time (into the url + body only — headers carry {{ROOT}}). Same
 * template mechanic as {{ROOT}}, so the least-privilege scope is baked in from the human's
 * pick, never blanket full_access authored by the agent.
 */
const RESOURCE_PLACEHOLDER = "{{RESOURCE}}";
const PERMISSION_PLACEHOLDER = "{{PERMISSION}}";
const EXPIRY_PLACEHOLDER = "{{EXPIRY}}";

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
      /** OPTIONAL dot-path to the provider's key ID in the response (e.g. `id`). VALUE-FREE
       * — an identifier, not the secret. Captured + stored so a later ROTATION can revoke
       * exactly this key by id (the `{{OLD_KEY_ID}}` the revoke call substitutes). */
      idPath: z.string().min(1).optional(),
    })
    .optional(),
  /** `confirm`/`destructive` require an explicit `confirmed:true` to run (approve
   * gate). Omitted / `safe` = auto-run (read-only permission checks never nag). */
  danger: DangerSchema.optional(),
  /**
   * GUIDED least-privilege mint (PRD §4.5). When true, the daemon runs the provider's
   * value-free DISCOVERY probe (a read-only GET) BEFORE parking this consequential mint,
   * enumerates the real resources + permission options, and parks them as `choices` for the
   * human to steer. The human's {resource, permission, expiry} pick is substituted into the
   * `{{RESOURCE}}`/`{{PERMISSION}}`/`{{EXPIRY}}` placeholders (url + body) at approve time.
   * The provider needs a discovery spec (getDiscoverySpec) or the request is rejected.
   */
  discover: z.boolean().optional(),
});
export type MintAction = z.infer<typeof MintActionSchema>;

/** A value-free execution result — names + status only, NEVER a secret value. */
export interface MintResult {
  providerAccount: string;
  /** The env-var name written (mint) — never its value. */
  varName?: string;
  status:
    | "minted"
    | "reused"
    | "ok"
    | "rejected"
    | "needs-confirm"
    | "no-root"
    | "failed"
    // ROTATION (PRD Phase 2): the new key is live + working, but the OLD key could NOT be
    // revoked — the human must revoke it manually (see `reason`). NOT a broken project.
    | "partial";
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
  /**
   * MULTI-ROOT (PRD §4.4): the SPECIFIC root value the daemon resolved from the human's
   * selected `rootId`. Daemon-INTERNAL, set ONLY by `approveMintAction` — never by the agent
   * (the agent authors names, not values). When set it overrides `resolveRoot` so the mint
   * spends exactly the chosen root even when the provider holds several (which is ambiguous).
   */
  rootValue?: string;
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

/** Pluck a VALUE-FREE provider key id (a string identifier) at `idPath`, or undefined. */
function extractKeyId(body: unknown, idPath: string): string | undefined {
  const id = pluck(body, idPath);
  return id === undefined || id === null || id === "" ? undefined : String(id);
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
 * The shared root-resolve + outbound-call core (gates 4 + 5), factored so the mint executor
 * AND the read-only discovery probe walk the SAME security path — one place resolves
 * `{{ROOT}}`, refuses an off-allowlist redirect, and scrubs secrets from any error. Returns
 * the successful Response for the caller to consume, or a value-free error MintResult.
 * The caller MUST have already passed `structuralReject` (allowlist + header hygiene).
 */
async function sendWithRoot(
  action: MintAction,
  rootOverride?: string,
): Promise<{ res: Response } | { error: MintResult }> {
  const { providerAccount } = action;
  // 4. resolve the root key. A daemon-supplied `rootOverride` (the human's selected root id,
  //    resolved to a value in approveMintAction) wins — it disambiguates a multi-root provider.
  //    Otherwise: a pasted single root, else an OAuth grant token (refreshed in place).
  const root =
    rootOverride ??
    resolveRoot(providerAccount) ??
    (await resolveGrantToken(providerOf(providerAccount)));
  if (usesRoot(action) && !root) {
    return {
      error: {
        providerAccount,
        status: "no-root",
        reason: `no root key stored for ${providerAccount} — paste one in the dashboard first`,
      },
    };
  }
  const secrets = root ? [root] : [];
  const headers: Record<string, string> = {
    ...(action.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...resolveHeaders(action.headers ?? {}, root ?? ""),
  };

  // 5. the HTTP call — the ONLY place the root leaves the daemon, toward the allowlisted
  //    host verified by structuralReject. `redirect:"manual"` so a 3xx can never carry the
  //    root to an off-allowlist Location (fetch would not re-check the hop → we refuse it).
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
      error: {
        providerAccount,
        status: "failed",
        reason: scrub(`network error: ${(err as Error).message}`, secrets),
      },
    };
  }
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    return {
      error: {
        providerAccount,
        status: "failed",
        reason: "provider returned a redirect — not followed (off-allowlist hop blocked)",
      },
    };
  }
  if (!res.ok) {
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
    return {
      error: {
        providerAccount,
        status: "failed",
        reason: scrub(detail ? `${gap}: ${detail}` : gap, secrets),
      },
    };
  }
  return { res };
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

  // 4 + 5. resolve the root key (the human's selected root via opts.rootValue when multi-root,
  //         else a pasted single root or an OAuth grant) and make the ONE outbound call to the
  //         allowlisted host — off-allowlist redirect refused, secrets scrubbed from any error.
  //         Shared with the discovery probe (sendWithRoot).
  const sent = await sendWithRoot(action, opts.rootValue);
  if ("error" in sent) return sent.error;
  const { res } = sent;

  // 6. no extract → a permission-check / wire action succeeded (no key to file).
  if (!action.extract) return { providerAccount, status: "ok" };

  // extract the minted secret → sink (.env.local for local, Infisical for deployed).
  let bodyJson: unknown;
  try {
    bodyJson = await res.json();
  } catch {
    return { providerAccount, status: "failed", reason: "response was not JSON — cannot extract" };
  }
  const value = pluck(bodyJson, action.extract.path);
  if (value === undefined || value === null || value === "") {
    return {
      providerAccount,
      status: "failed",
      reason: `extract path '${action.extract.path}' not found in response`,
    };
  }

  const varName = action.extract.varName;
  const minted = String(value);
  // Capture the provider key id (value-free) when the agent gave an `idPath`, so a later
  // rotation can revoke exactly this key. Absent idPath / missing field → no keyId (fine).
  const keyId = action.extract.idPath ? extractKeyId(bodyJson, action.extract.idPath) : undefined;
  await syncCredential(varName, minted, { env: opts.env, envLocalPath: opts.envLocalPath });
  // Persist to the vault with the audit name as provenance (find + revoke later).
  putCredential(varName, {
    value: minted,
    provider: auditName(opts.repoName, opts.env, providerAccount),
    updatedAt: new Date().toISOString(),
    ...(keyId ? { keyId } : {}),
  });
  return { providerAccount, varName, status: "minted" };
}

/**
 * The value-free DISCOVERY probe (PRD §4.5). Runs the provider's read-only GET with the
 * root/grant to enumerate its scopable resources + the least-privilege permission menu —
 * NAMES/ids + labels only, NEVER a secret. It walks the SAME gates as a mint (structural
 * floor → sendWithRoot: allowlist, root-substitute, redirect refusal, scrub); a GET is not
 * consequential, so it needs no human approval. Returns the value-free `MintChoices`, or a
 * value-free `MintResult` when there's no spec, the probe fails, or nothing is discovered.
 */
export async function runDiscovery(
  providerAccount: string,
  rootOverride?: string,
): Promise<MintChoices | MintResult> {
  const spec = getDiscoverySpec(providerOf(providerAccount));
  if (!spec) {
    return {
      providerAccount,
      status: "rejected",
      reason: `no discovery spec for ${providerOf(providerAccount)} — cannot run a guided mint`,
    };
  }
  const probe: MintAction = {
    providerAccount,
    method: "GET",
    url: spec.url,
    headers: spec.headers,
  };
  // The structural floor still applies to the probe url (allowlist + header hygiene).
  const rejected = structuralReject(probe);
  if (rejected) return rejected;
  // A `rootOverride` runs discovery against the human's SELECTED root (multi-root, deferred
  // to approve time); otherwise the single stored root/grant, as at propose time.
  const sent = await sendWithRoot(probe, rootOverride);
  if ("error" in sent) return sent.error;
  let body: unknown;
  try {
    body = await sent.res.json();
  } catch {
    return { providerAccount, status: "failed", reason: "discovery response was not JSON" };
  }
  const list = pluck(body, spec.listPath);
  if (!Array.isArray(list)) {
    return {
      providerAccount,
      status: "failed",
      reason: `discovery: no resource list at '${spec.listPath}'`,
    };
  }
  // Pull ONLY the id + name fields — never the raw resource object (value-free by construction).
  const resources = list
    .map((item) => ({
      id: String(pluck(item, spec.idField) ?? ""),
      name: String(pluck(item, spec.nameField) ?? pluck(item, spec.idField) ?? ""),
    }))
    .filter((r) => r.id !== "");
  return {
    resources,
    permissions: spec.permissions,
    // The narrowest permission is the SUGGESTED default (agent suggests, human confirms/edits).
    suggestedPermission: spec.permissions[0] ?? "",
    supportsExpiry: spec.supportsExpiry,
  };
}

/** Substitute the guided placeholders ({{RESOURCE}}/{{PERMISSION}}/{{EXPIRY}}) throughout a
 * JSON value (deep). An object key whose value is exactly `{{EXPIRY}}` is DROPPED when no
 * expiry was selected (or the provider doesn't support it) so an unfilled placeholder never
 * ships as a literal string. Headers are untouched here — they carry {{ROOT}} only. */
function deepSubstitute(value: unknown, sel: MintSelection, withExpiry: boolean): unknown {
  if (typeof value === "string") {
    return value
      .split(RESOURCE_PLACEHOLDER)
      .join(sel.resource)
      .split(PERMISSION_PLACEHOLDER)
      .join(sel.permission)
      .split(EXPIRY_PLACEHOLDER)
      .join(withExpiry ? (sel.expiry ?? "") : "");
  }
  if (Array.isArray(value)) return value.map((v) => deepSubstitute(v, sel, withExpiry));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!withExpiry && v === EXPIRY_PLACEHOLDER) continue; // drop an unfilled expiry field
      out[k] = deepSubstitute(v, sel, withExpiry);
    }
    return out;
  }
  return value;
}

/**
 * Validate + apply the human's selection to a parked guided-mint template. The selection is
 * checked against the DISCOVERED options (a resource id that wasn't enumerated, or a
 * permission outside the spec's menu, is refused) so a compromised dashboard can't scope a
 * mint to an arbitrary resource/permission. On success, the {{RESOURCE}}/{{PERMISSION}}/
 * {{EXPIRY}} placeholders are substituted into the url + body — the least-privilege scope
 * baked in from the human's pick, not a blanket full_access authored by the agent.
 */
function applySelection(
  action: MintAction,
  selection: MintSelection | undefined,
  choices: MintChoices,
): { action: MintAction } | { reject: string } {
  if (!selection)
    return { reject: "a resource + permission selection is required for a guided mint" };
  if (!choices.resources.some((r) => r.id === selection.resource)) {
    return { reject: "selected resource is not one of the discovered options" };
  }
  if (!choices.permissions.includes(selection.permission)) {
    return { reject: "selected permission is not one of the offered least-privilege options" };
  }
  const withExpiry = choices.supportsExpiry && !!selection.expiry;
  return {
    action: {
      ...action,
      url: action.url
        .split(RESOURCE_PLACEHOLDER)
        .join(selection.resource)
        .split(PERMISSION_PLACEHOLDER)
        .join(selection.permission)
        .split(EXPIRY_PLACEHOLDER)
        .join(withExpiry ? (selection.expiry ?? "") : ""),
      ...(action.body !== undefined
        ? { body: deepSubstitute(action.body, selection, withExpiry) }
        : {}),
    },
  };
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
const pendingMints = new Map<
  string,
  { action: MintAction; opts: MintOpts; choices?: MintChoices; rotate?: RotateAction }
>();

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
  return parkConsequential(action, opts);
}

/**
 * Park a consequential action under a fresh unforgeable nonce → the value-free `needs-confirm`
 * for the agent + the `pending` (with the nonce) for the dashboard SSE. Shared by
 * `proposeMintAction` and `proposeRotateAction`; `rotate` (when set) tags the parked entry so
 * the human's one approval runs the whole rotation instead of a plain mint. The multi-root +
 * guided-discovery choice logic runs on `action` (the mint template) exactly the same for both.
 */
async function parkConsequential(
  action: MintAction,
  opts: MintOpts,
  rotate?: RotateAction,
): Promise<ProposeResult> {
  // MULTI-ROOT (PRD §4.4): when the provider holds >1 root the mint can't silently pick one —
  // the human must choose WHICH via the value-free root menu. `resolveRoot` is ambiguous here
  // (returns null), so discovery can't run yet; it's DEFERRED to approve time against the
  // chosen root. Single/zero root → the existing guided path (discovery runs now).
  const roots = listRootsFor(action.providerAccount);
  const multiRoot = roots.length > 1;

  // GUIDED least-privilege (PRD §4.5): a `discover`-flagged consequential mint runs the
  // value-free discovery probe FIRST, then parks the discovered menu as `choices`. Discovery
  // failing (no spec / probe error / nothing found) rejects the proposal — never park a mint
  // whose {{RESOURCE}}/{{PERMISSION}} placeholders can't be filled.
  let choices: MintChoices | undefined;
  if (action.discover && !multiRoot) {
    const disc = await runDiscovery(action.providerAccount);
    if ("status" in disc) return { result: disc }; // a MintResult → discovery failed, don't park
    if (disc.resources.length === 0) {
      return {
        result: {
          providerAccount: action.providerAccount,
          status: "failed",
          reason: "discovery found no resources to scope this mint to",
        },
      };
    }
    choices = disc;
  } else if (action.discover && multiRoot) {
    // Defer resource discovery to approve time. Surface the spec-level permission menu + the
    // roots to pick from NOW (permissions are root-independent); `resources` fill in once the
    // human picks a root. Reject value-free if the provider has no spec (can't guide it).
    const spec = getDiscoverySpec(providerOf(action.providerAccount));
    if (!spec) {
      return {
        result: {
          providerAccount: action.providerAccount,
          status: "rejected",
          reason: `no discovery spec for ${providerOf(action.providerAccount)} — cannot run a guided mint`,
        },
      };
    }
    choices = {
      resources: [],
      permissions: spec.permissions,
      suggestedPermission: spec.permissions[0] ?? "",
      supportsExpiry: spec.supportsExpiry,
      roots,
    };
  } else if (multiRoot) {
    // A consequential but NON-guided mint against a multi-root provider still needs the human
    // to pick which root to spend — park just the root menu (no resource/permission steering).
    choices = {
      resources: [],
      permissions: [],
      suggestedPermission: "",
      supportsExpiry: false,
      roots,
    };
  }
  const id = randomBytes(6).toString("hex");
  const nonce = randomBytes(24).toString("hex");
  pendingMints.set(nonce, {
    action,
    opts,
    ...(choices ? { choices } : {}),
    ...(rotate ? { rotate } : {}),
  });
  const verb = rotate ? "rotate" : (action.danger ?? action.method);
  const pending: PendingMint = {
    id,
    nonce,
    providerAccount: action.providerAccount,
    method: action.method,
    danger: action.danger,
    varName: rotate ? rotate.varName : action.extract?.varName,
    ...(choices ? { choices } : {}),
    ...(rotate ? { rotate: true } : {}),
  };
  return {
    pending,
    result: {
      providerAccount: action.providerAccount,
      status: "needs-confirm",
      id,
      reason: `human approval required (${verb}) — approve in the dashboard`,
    },
  };
}

/**
 * The HUMAN approves a parked mint by posting its server nonce to POST /api/action. The
 * agent never received the nonce, so it cannot forge this. An unknown or already-used
 * nonce is rejected (never executes). On a hit the parked action runs with the ONE
 * `confirmed:true` the system ever sets.
 *
 * GUIDED mints (PRD §4.5) also carry the human's `selection` — the daemon validates it
 * against the discovered options and substitutes {{RESOURCE}}/{{PERMISSION}}/{{EXPIRY}}
 * into the action BEFORE executing, so the minted key is scoped to exactly what the human
 * chose (least-privilege), never the blanket permission the agent might have authored.
 */
export async function approveMintAction(
  nonce: string,
  selection?: MintSelection,
): Promise<MintResult> {
  const parked = nonce ? pendingMints.get(nonce) : undefined;
  if (!parked) {
    return { providerAccount: "", status: "rejected", reason: "unknown or already-used approval" };
  }
  pendingMints.delete(nonce);
  let action = parked.action;
  const reject = (reason: string): MintResult => ({
    providerAccount: action.providerAccount,
    status: "rejected",
    reason,
  });

  // MULTI-ROOT (PRD §4.4): the parked choice offered >1 root → a root selection is REQUIRED and
  // validated against the enumerated ids (a compromised dashboard can't inject an arbitrary
  // root — same "must match an offered option" guard as the resource/permission pick). The
  // daemon resolves the VALUE by the chosen id and spends exactly that root.
  let rootValue: string | undefined;
  const rootChoices = parked.choices?.roots;
  if (rootChoices && rootChoices.length > 0) {
    if (!selection?.rootId) {
      return reject("a root selection is required — this provider holds multiple roots");
    }
    if (!rootChoices.some((r) => r.id === selection.rootId)) {
      return reject("selected root is not one of the offered roots");
    }
    const resolved = resolveRootById(selection.rootId);
    if (!resolved) return reject("selected root is no longer available");
    rootValue = resolved;
  }

  // GUIDED (discover) mint: run discovery against the CHOSEN root when multi-root (deferred
  // from propose), else use the choices discovered at propose (single-root). Then validate the
  // resource/permission pick + substitute the least-privilege placeholders.
  if (parked.action.discover) {
    let choices = parked.choices;
    if (rootValue) {
      const disc = await runDiscovery(action.providerAccount, rootValue);
      if ("status" in disc) return disc; // discovery against the chosen root failed → value-free
      choices = disc;
    }
    if (!choices) return reject("guided mint lost its discovered choices");
    const applied = applySelection(action, selection, choices);
    if ("reject" in applied) return reject(applied.reject);
    action = applied.action;
  }

  // ROTATION (PRD Phase 2): the parked entry is a rotation — the human's ONE approval runs the
  // whole atomic rotate. `action` is now the (optionally guided/root-scoped) NEW-key mint; feed
  // it plus the revoke template into the state machine. All value handling stays daemon-local.
  if (parked.rotate) {
    return runRotationApproved({ ...parked.rotate, mint: action }, parked.opts, rootValue);
  }

  return executeMintAction(action, { ...parked.opts, confirmed: true, rootValue });
}

// ── ROTATION (PRD Phase 2): mint-new → reconfigure → revoke-old, with safe rollback ─────────

const OLD_KEY_ID_PLACEHOLDER = "{{OLD_KEY_ID}}";

/**
 * A ROTATION the agent authors: swap the key filed under `varName` for a fresh one, then revoke
 * the old. `mint` is a normal scoped/guided mint template (its `extract.varName` MUST equal
 * `varName`, `extract.idPath` SHOULD name the new key's id). `revoke` is the old-key delete —
 * its url/body may carry `{{OLD_KEY_ID}}` (filled daemon-side from the stored old key id) and
 * its headers carry `{{ROOT}}`. Both are consequential; the human's ONE approval covers both.
 */
export const RotateActionSchema = z.object({
  varName: z.string().min(1),
  mint: MintActionSchema,
  revoke: MintActionSchema,
});
export type RotateAction = z.infer<typeof RotateActionSchema>;

/** Substitute the stored OLD key id into the revoke action's url + body (headers carry {{ROOT}}). */
function fillOldKeyId(action: MintAction, oldKeyId: string): MintAction {
  const sub = (s: string): string => s.split(OLD_KEY_ID_PLACEHOLDER).join(oldKeyId);
  const subDeep = (v: unknown): unknown =>
    typeof v === "string"
      ? sub(v)
      : Array.isArray(v)
        ? v.map(subDeep)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subDeep(x)]))
          : v;
  return {
    ...action,
    url: sub(action.url),
    ...(action.body !== undefined ? { body: subDeep(action.body) } : {}),
  };
}

/**
 * The agent PROPOSES a rotation (the MCP `rotateKey` entry). A rotation is inherently
 * consequential (it mints AND revokes with the root key), so it is ALWAYS parked for a human —
 * never auto-run. Both the mint + revoke templates pass the structural floor up front, and the
 * mint must extract into `varName` (so the new key overwrites the old under the same name).
 */
export async function proposeRotateAction(
  rotate: RotateAction,
  opts: MintOpts,
): Promise<ProposeResult> {
  for (const a of [rotate.mint, rotate.revoke]) {
    const r = structuralReject(a);
    if (r) return { result: r };
  }
  if (!rotate.mint.extract || rotate.mint.extract.varName !== rotate.varName) {
    return {
      result: {
        providerAccount: rotate.mint.providerAccount,
        status: "rejected",
        reason: `rotate.mint must extract into '${rotate.varName}' (the var being rotated)`,
      },
    };
  }
  return parkConsequential(rotate.mint, opts, rotate);
}

/**
 * Build the daemon-local rotation effects for an APPROVED rotation, then run the state machine.
 * The value adapter: the OLD value + minted NEW value live ONLY in this closure — the pure
 * `runRotation` orchestrator (and everything it returns) is value-free. Records the outcome to
 * the value-free audit log. `mint` here is the already-scoped/root-selected NEW-key mint.
 */
async function runRotationApproved(
  rotate: RotateAction,
  opts: MintOpts,
  rootValue: string | undefined,
): Promise<MintResult> {
  const { varName } = rotate;
  const providerAccount = rotate.mint.providerAccount;
  const provenance = auditName(opts.repoName, opts.env, providerAccount);

  // Read the OLD value (to restore on abort) + the OLD key id (to revoke) — daemon-local.
  const [oldHit] = discoverCredentials([varName], { envLocalPath: opts.envLocalPath });
  const oldValue = oldHit?.value;
  const oldKeyId = readStore().credentials[varName]?.keyId;
  if (!oldValue) {
    return {
      providerAccount,
      varName,
      status: "failed",
      reason: `no current ${varName} to rotate`,
    };
  }

  let newValue: string | undefined;
  let newKeyId: string | undefined;

  const fx: RotationEffects = {
    varName,
    ...(oldKeyId ? { oldKeyId } : {}),
    // minting — mint the new key at the provider; hold the value in this closure.
    async mintNew() {
      const sent = await sendWithRoot(rotate.mint, rootValue);
      if ("error" in sent) return { ok: false, reason: sent.error.reason ?? "mint failed" };
      let body: unknown;
      try {
        body = await sent.res.json();
      } catch {
        return { ok: false, reason: "mint response was not JSON" };
      }
      const v = pluck(body, rotate.mint.extract!.path);
      if (v === undefined || v === null || v === "") {
        return { ok: false, reason: `minted value not found at '${rotate.mint.extract!.path}'` };
      }
      newValue = String(v);
      newKeyId = rotate.mint.extract!.idPath
        ? extractKeyId(body, rotate.mint.extract!.idPath)
        : undefined;
      return { ok: true, ...(newKeyId ? { newKeyId } : {}) };
    },
    // reconfiguring — switch the sink + vault to the new key (old value stays recoverable).
    async reconfigure() {
      try {
        await syncCredential(varName, newValue!, {
          env: opts.env,
          envLocalPath: opts.envLocalPath,
        });
        putCredential(varName, {
          value: newValue!,
          provider: provenance,
          updatedAt: new Date().toISOString(),
          ...(newKeyId ? { keyId: newKeyId } : {}),
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: (err as Error).message };
      }
    },
    // revoking — DELETE the old key by id at the provider (already human-approved → confirmed).
    async revokeOld() {
      const revoke = fillOldKeyId(rotate.revoke, oldKeyId!);
      const r = await executeMintAction(revoke, { ...opts, confirmed: true, rootValue });
      return r.status === "ok" || r.status === "reused"
        ? { ok: true }
        : { ok: false, reason: r.reason ?? r.status };
    },
    // abort — roll the sink + vault back to the old (working) key.
    async restore() {
      await syncCredential(varName, oldValue, { env: opts.env, envLocalPath: opts.envLocalPath });
      putCredential(varName, {
        value: oldValue,
        provider: provenance,
        updatedAt: new Date().toISOString(),
        ...(oldKeyId ? { keyId: oldKeyId } : {}),
      });
    },
  };

  const outcome = await runRotation(fx);
  appendRotation({
    varName: outcome.varName,
    provider: providerOf(providerAccount),
    ...(outcome.oldKeyId ? { oldKeyId: outcome.oldKeyId } : {}),
    ...(outcome.newKeyId ? { newKeyId: outcome.newKeyId } : {}),
    outcome:
      outcome.state === "done" ? "done" : outcome.state === "partial" ? "partial" : "aborted",
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ts: new Date().toISOString(),
  });
  return rotationResult(outcome, providerAccount);
}

/** Map a value-free RotationOutcome → the MintResult the approve path returns. `done` → minted
 * (new key live), `partial` → partial (live but old NOT revoked — revoke manually), else failed. */
function rotationResult(o: RotationOutcome, providerAccount: string): MintResult {
  const status: MintResult["status"] =
    o.state === "done" ? "minted" : o.state === "partial" ? "partial" : "failed";
  return { providerAccount, varName: o.varName, status, ...(o.reason ? { reason: o.reason } : {}) };
}
