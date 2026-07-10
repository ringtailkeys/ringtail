/**
 * BATCH PROVISION — the repetition-killer (the North Star). For every new project a
 * human re-does the same provider dance to extract the same kinds of keys. Ringtail's
 * promise: connect each provider ONCE (a root in the multi-root registry), then every
 * new project PROVISIONS ITSELF from those roots. This module is the value-free PLANNER
 * that turns a project's `.env.example`-derived var list into a per-var decision — the
 * classification that drives the one-approval batch (proposeProvision/approveProvision
 * in ./mint). It authors NO HTTP and touches NO value: names / providers / plan only.
 *
 * It also owns the var → provider (recipe id) mapping (detectProvider) — a leaf here so
 * both gridFromExample (./index) and the planner share ONE source of truth without a
 * module cycle.
 */
import { getRecipe, type Recipe } from "@ringtail/recipes";
import type { ConnectedProvider, RootInfo } from "@ringtail/store";

// Known env-var → provider (recipe id) fallback, so a header-LESS `.env.example` still
// splits into real provider rows instead of collapsing to one 'other'. Prefix match, first
// hit wins — specific prefixes before general ones. Ids MUST mirror @ringtail/recipes ids
// (neon · resend · better-auth · posthog · cloudflare · creem · infisical · godaddy) — never
// invent one. (Moved here from ./index so the planner + gridFromExample share it.)
const VAR_PROVIDER: [RegExp, string][] = [
  [/^(DATABASE_URL|POSTGRES|PG|NEON)/, "neon"],
  [/^RESEND/, "resend"],
  [/^BETTER_AUTH/, "better-auth"],
  [/^(NEXT_PUBLIC_)?POSTHOG/, "posthog"],
  [/^(CLOUDFLARE|CF)_/, "cloudflare"],
  [/^(CREEM|STRIPE|DODO)/, "creem"], // the billing provider
  [/^INFISICAL/, "infisical"],
  [/^GODADDY/, "godaddy"],
];

/** Map an env-var NAME to its provider (recipe id) by known prefix, or undefined. Used both
 *  as the header-less fallback in gridFromExample AND by the planner. Names only — never a value. */
export function detectProvider(key: string): string | undefined {
  const up = key.toUpperCase();
  return VAR_PROVIDER.find(([re]) => re.test(up))?.[1];
}

/**
 * The four decisions the planner can reach for one needed var:
 *  - `mint-from-root` — a recipe exists AND a root/grant for it is connected (or the recipe
 *                       mints locally): this var provisions itself. Carries `rootId` when the
 *                       provider holds exactly one root (the one the batch will spend).
 *  - `needs-root`     — a recipe exists but NO root is connected: tell the user to connect it
 *                       once, then it self-provisions on the next run.
 *  - `guided-paste`   — no recipe for this key: the human pastes it by hand (the long tail).
 *  - `skip`           — a non-secret: either a provisioned RESOURCE var (e.g. `DATABASE_URL` — it
 *                       needs a resource, not a mintable key) OR a plain CONFIG value (a URL, a
 *                       public product/tenant/account id, a from-address). Flagged, NEVER faked.
 */
export type ProvisionAction = "mint-from-root" | "needs-root" | "guided-paste" | "skip";

/** One value-free line of the plan: a var + its provider + the decision + why. NEVER a value. */
export interface ProvisionItem {
  varName: string;
  /** Recipe id (e.g. `resend`), or "" when no recipe matched the var. */
  provider: string;
  action: ProvisionAction;
  /** Plain-language cause the agent/human reads. No value. */
  reason: string;
  /** MULTI-ROOT: the connected root's value-free id when the provider holds EXACTLY one — the
   * root the batch spends. Omitted when there are 0 roots (needs-root) or >1 (the human picks). */
  rootId?: string;
}

/** The whole value-free plan for a project — the input the one-approval batch is built from. */
export interface ProvisionPlan {
  project?: string;
  items: ProvisionItem[];
}

/**
 * A var the recipe DECLARES in `envVars` but that is NOT one of its root keys is a provisioned
 * RESOURCE (Neon's `DATABASE_URL`, Cloudflare's `CLOUDFLARE_ACCOUNT_ID`), not a mintable key —
 * it comes from creating a resource, not from minting a token. Flag it `skip`, never fake it.
 * Recipes with no declared root keys treat every declared var as mintable (no resource split).
 */
function isResourceVar(recipe: Recipe, varName: string): boolean {
  const roots = recipe.rootCredKeys ?? [];
  return roots.length > 0 && recipe.envVars.includes(varName) && !roots.includes(varName);
}

/**
 * A CONSERVATIVE non-secret detector — the dogfood (krispyai-cloud) showed obvious config values
 * (a URL, product ids, from-addresses) mis-classified as mint-from-root / needs-root / guided-paste,
 * so the human was told to provision things that aren't secrets. These name shapes are non-secrets
 * by construction:
 *   - `*_URL` (incl. `NEXT_PUBLIC_*_URL`) — an endpoint, never a mintable key.
 *   - a PUBLIC identifier — a product / tenant / account / OAuth client id (`*_PRODUCT_ID*`,
 *     `*_TENANT*`, `*_ACCOUNT_ID`, `*_CLIENT_ID`). Deliberately NOT a blanket `*_ID` (a real key
 *     var rarely ends in `_ID`, but blanket-skipping every `_ID` risks skipping one).
 *   - a from-ADDRESS (`*_FROM`, e.g. `EMAIL_FROM` / `LEAD_EMAIL_FROM`) — an email address, not a key.
 * CONSERVATIVE BIAS: only these clear shapes match. Anything ambiguous returns false and stays
 * `guided-paste` — skipping a REAL secret (silent breakage) is worse than guided-pasting a config
 * value (one wasted paste). A recipe-declared RESOURCE var (`DATABASE_URL`) is exempted at the call
 * site so it keeps its more specific `skip (resource)` reason.
 */
function isConfigVar(varName: string): boolean {
  const up = varName.toUpperCase();
  if (up.endsWith("_URL")) return true; // NEXT_PUBLIC_*_URL ends in _URL too
  if (/(_PRODUCT_ID|_TENANT|_ACCOUNT_ID|_CLIENT_ID)/.test(up)) return true;
  if (up.endsWith("_FROM")) return true; // EMAIL_FROM / LEAD_EMAIL_FROM / *_FROM
  return false;
}

/**
 * Classify each needed var → its provision decision (the value-free PLAN). Pure: no I/O, no
 * value — the daemon fetches `roots`/`grants` from the store and hands them in, so this stays
 * unit-testable in isolation. A var already satisfied is NOT special-cased here (the mint path's
 * own idempotency reuses an already-provisioned key); the plan is about HOW each var is acquired.
 */
export function planProvision(input: {
  /** The project's needed env-var names (flattened from its `.env.example` grid). */
  vars: string[];
  /** The connected named roots (store.listRoots()) — value-free ids/labels/providers. */
  roots: RootInfo[];
  /** The connected OAuth grants (store.listConnectedProviders()) — names + scopes, no token. */
  grants?: ConnectedProvider[];
  project?: string;
}): ProvisionPlan {
  const grants = input.grants ?? [];
  const items = input.vars.map((varName): ProvisionItem => {
    const provider = detectProvider(varName);
    const recipe = provider ? getRecipe(provider) : undefined;

    // Obvious config / non-secret var (URL, product/tenant/account id, from-address) → skip BEFORE
    // the provider/mint rules, so it's never told to mint/connect-a-root/paste. A recipe-declared
    // RESOURCE var (DATABASE_URL) is exempted so it keeps its more specific `skip (resource)` reason.
    if (isConfigVar(varName) && !(recipe && isResourceVar(recipe, varName))) {
      return {
        varName,
        provider: provider ?? "",
        action: "skip",
        reason: `${varName} is a config value (URL / public id / address) — not a provisionable secret`,
      };
    }

    // No recipe → the long tail: a human pastes this key by hand.
    if (!provider || !recipe) {
      return {
        varName,
        provider: provider ?? "",
        action: "guided-paste",
        reason: "no recipe for this key — paste it by hand",
      };
    }

    // A provisioned resource (DATABASE_URL, ACCOUNT_ID) — needs a resource, not a key.
    if (isResourceVar(recipe, varName)) {
      return {
        varName,
        provider,
        action: "skip",
        reason: `${varName} is a provisioned ${recipe.title} resource (needs a resource, not a mintable key)`,
      };
    }

    // A generate recipe (e.g. better-auth) mints the secret LOCALLY — no external root needed.
    if (recipe.mode === "generate") {
      return {
        varName,
        provider,
        action: "mint-from-root",
        reason: `Ringtail mints ${recipe.title} locally — no root needed`,
      };
    }

    // Mintable: is a root (or OAuth grant) for this provider connected?
    const providerRoots = input.roots.filter((r) => r.provider === provider);
    const connected = providerRoots.length > 0 || grants.some((g) => g.provider === provider);
    if (!connected) {
      return {
        varName,
        provider,
        action: "needs-root",
        reason: `connect a ${recipe.title} root once — then this provisions itself every project`,
      };
    }
    return {
      varName,
      provider,
      action: "mint-from-root",
      reason: `mint a scoped ${recipe.title} key from your connected root`,
      // Exactly one root → name it (the batch spends it); >1 → the human picks at approve.
      ...(providerRoots.length === 1 ? { rootId: (providerRoots[0] as RootInfo).id } : {}),
    };
  });
  return { ...(input.project ? { project: input.project } : {}), items };
}
