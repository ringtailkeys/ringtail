import type { MintChoices, MintSelection } from "@ringtail/core";

/**
 * The guided-mint choice-card logic (PRD §4.5), extracted pure so it's unit-testable
 * without a DOM. The human steers a parked mint with a value-free menu: pick the
 * resource, the least-privilege permission (defaulting to the narrowest/suggested),
 * an optional expiry, and — when the provider holds >1 named root — WHICH root to spend.
 *
 * Value-free by construction: everything here is ids/names/labels. `viewChoices`
 * whitelists exactly the safe fields off the SSE `choices`, so a secret slipped into the
 * payload can never reach the UI. THE GUARANTEE (agent never sees a value) holds even if
 * the daemon regressed — the mapping drops anything not on the allowlist.
 */

/** The value-free shape the card renders — a strict projection of MintChoices. */
export interface ChoiceView {
  resources: Array<{ id: string; name: string }>;
  permissions: string[];
  suggestedPermission: string;
  supportsExpiry: boolean;
  /** Present only when >1 named root exists → the human must pick one. */
  roots?: Array<{ id: string; provider: string; label?: string; account?: string }>;
}

/**
 * Whitelist the safe fields off the SSE `choices`. Anything not named here (a `value`,
 * a token, a discoveredResources blob) is DROPPED — the card can only ever render
 * ids/names/labels. This is the value-free gate for the choice UI.
 */
export function viewChoices(choices: MintChoices): ChoiceView {
  return {
    resources: choices.resources.map((r) => ({ id: r.id, name: r.name })),
    permissions: [...choices.permissions],
    suggestedPermission: choices.suggestedPermission,
    supportsExpiry: choices.supportsExpiry,
    ...(choices.roots && choices.roots.length > 0
      ? {
          roots: choices.roots.map((r) => ({
            id: r.id,
            provider: r.provider,
            ...(r.label ? { label: r.label } : {}),
            ...(r.account ? { account: r.account } : {}),
          })),
        }
      : {}),
  };
}

/**
 * The initial selection: narrowest permission (the agent's suggestion, [0]), the first
 * discovered resource, no expiry, and — when >1 root is offered — the first root
 * pre-selected (editable). Least-privilege by default; the human confirms or narrows.
 */
export function defaultSelection(choices: ChoiceView): MintSelection {
  return {
    resource: choices.resources[0]?.id ?? "",
    permission: choices.suggestedPermission || choices.permissions[0] || "",
    ...(choices.roots && choices.roots.length > 0 ? { rootId: choices.roots[0]?.id } : {}),
  };
}

/**
 * Is the selection valid to approve? A resource + a permission from the menu, and — when
 * the card offered roots (>1) — a `rootId` that is one of them (the daemon re-validates,
 * but the button stays disabled until the human has actually chosen a root).
 */
export function isSelectionComplete(choices: ChoiceView, sel: MintSelection): boolean {
  if (!sel.resource || !choices.resources.some((r) => r.id === sel.resource)) return false;
  if (!sel.permission || !choices.permissions.includes(sel.permission)) return false;
  if (choices.roots && choices.roots.length > 0) {
    if (!sel.rootId || !choices.roots.some((r) => r.id === sel.rootId)) return false;
  }
  return true;
}
