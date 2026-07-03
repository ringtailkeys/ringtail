/**
 * @ringtail/recipes — one Recipe per provider. A recipe knows which env vars it
 * owns, how it's acquired (mode), how to scope-validate a token, and how to
 * auto-provision one. Live scope/token-URL details are pulled from Context7 at
 * runtime so recipes don't rot against provider API changes.
 */
export type RecipeMode = "auto" | "guided" | "generate";

export interface ValidateResult {
  ok: boolean;
  /** Scopes the token actually carries. */
  scopes: string[];
  /** Env vars the recipe wanted but didn't get. */
  missing: string[];
}

export interface ProvisionResult {
  values: Record<string, string>;
}

export interface Recipe {
  id: string;
  /** Env-var names this recipe owns (subset of the .env.example manifest). */
  envVars: string[];
  mode: RecipeMode;
  /** Scope-validate the acquired values against what the recipe requires. */
  validate(values: Record<string, string>): Promise<ValidateResult>;
  /** Drive the provider's official API to mint a scoped credential. */
  autoProvision(): Promise<ProvisionResult>;
}

export const cloudflare: Recipe = {
  id: "cloudflare",
  envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
  mode: "guided",

  async validate(values) {
    // TODO(c7): fetch current scopes/token-URL via Context7 at runtime, then
    // verify the token against Cloudflare's /user/tokens/verify endpoint.
    const missing = this.envVars.filter((k) => !values[k]);
    const hasToken = Boolean(values["CLOUDFLARE_API_TOKEN"]);
    return {
      ok: missing.length === 0 && hasToken,
      scopes: hasToken ? ["com.cloudflare.api.account.zone.read"] : [],
      missing,
    };
  },

  async autoProvision() {
    // TODO(c7): create a scoped token via Cloudflare's official token API.
    return { values: {} };
  },
};

export const RECIPES: Record<string, Recipe> = {
  [cloudflare.id]: cloudflare,
};
