/**
 * @ringtail/recipes — one Recipe per provider. A recipe knows which env vars it
 * owns, how it's acquired (mode), how to mint + scope-validate a token, and how
 * to auto-provision one. Live scope/token-URL details are marked TODO(c7) — to be
 * pulled from Context7 at runtime so recipes don't rot against provider changes.
 */
export type { Recipe, ValidateResult, Mode, ProvisionCtx } from "./recipe";

import type { Recipe } from "./recipe";
import { recipe as cloudflare } from "./recipes/cloudflare";
import { recipe as neon } from "./recipes/neon";
import { recipe as betterAuth } from "./recipes/better-auth";
import { recipe as resend } from "./recipes/resend";
import { recipe as posthog } from "./recipes/posthog";
import { recipe as infisical } from "./recipes/infisical";
import { recipe as creem } from "./recipes/creem";
import { mockRecipe, mockBadScopeRecipe, mockFailProvisionRecipe } from "./recipes/mock";

export {
  makeMockRecipe,
  mockRecipe,
  mockBadScopeRecipe,
  mockFailProvisionRecipe,
} from "./recipes/mock";

/**
 * The real provider registry — what the dashboard's connection grid renders and
 * what a real repo provisions. Order: auto (has a management API) first, then
 * guided (paste-and-validate), then generate (minted locally).
 */
export const RECIPES: Record<string, Recipe> = {
  [neon.id]: neon,
  [cloudflare.id]: cloudflare,
  [resend.id]: resend,
  [posthog.id]: posthog,
  [infisical.id]: infisical,
  [creem.id]: creem,
  [betterAuth.id]: betterAuth,
};

/** The mock provider recipes — used by the offline e2e + dev daemon, not shipped. */
export const MOCK_RECIPES: Record<string, Recipe> = {
  [mockRecipe.id]: mockRecipe,
  [mockBadScopeRecipe.id]: mockBadScopeRecipe,
  [mockFailProvisionRecipe.id]: mockFailProvisionRecipe,
};

/** Resolve a recipe by id across real + mock registries. */
export function getRecipe(id: string): Recipe | undefined {
  return RECIPES[id] ?? MOCK_RECIPES[id];
}
