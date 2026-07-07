import { fileURLToPath } from "node:url";
import nx from "@nx/eslint-plugin";
import oxlint from "eslint-plugin-oxlint";

// Absolute path so it resolves no matter which project dir Nx runs `eslint` from.
const oxlintConfigPath = fileURLToPath(new URL("./.oxlintrc.json", import.meta.url));

/**
 * Root ESLint flat config — this is where the boundary laws get TEETH.
 * `@nx/enforce-module-boundaries` turns "no upward import" from a review
 * convention into a lint error, using each project's `type:*` tag.
 *
 *   type:lib     → may depend on:  lib
 *   type:service → may depend on:  lib, service
 *   type:app     → may depend on:  lib, service   (NOT other apps)
 *   type:package → may depend on:  lib            (a distributable you SHIP)
 *
 * `type:package` (packages/*) is the 4th bucket: what you ship to third parties
 * (npm SDKs, embeddable widgets, CLIs). It may depend on libs only — and it's
 * TERMINAL: no app/service/lib/package lists `type:package` in its allowed tags,
 * so nothing internal can import a package. Shipped out, not consumed within.
 *
 * Tags live in each package.json under `nx.tags`. Deep imports past a lib's public
 * door (`@ringtail/store/src/...`) are also blocked here (banTransitiveDependencies
 * keeps the barrel file the contract).
 *
 * DIVISION OF LABOR: Oxlint does the bulk of linting (fast, Rust). ESLint is kept
 * ONLY for `@nx/enforce-module-boundaries` — the one rule Oxlint has no equivalent
 * for. The `eslint-plugin-oxlint` spread below reads `.oxlintrc.json` and turns OFF
 * every ESLint rule Oxlint already covers, so ESLint stops double-reporting. It must
 * be LAST so its "off" wins over the Nx presets above; it does not touch
 * enforce-module-boundaries.
 */
export default [
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  {
    ignores: ["**/out", "**/dist", "**/build", "**/node_modules", "**/.next", "**/.source"],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.js", "**/*.jsx"],
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          // Off: this repo bundles lib SOURCE at the consumer (Vite/esbuild inline
          // @ringtail/ui etc.) — no lib is independently built to `dist`, so the
          // "buildable lib must not import a non-buildable lib" guard is inapplicable.
          // The boundary LAWS below (the tag matrix) are what's enforced.
          enforceBuildableLibDependency: false,
          // The shared brand-asset folder (apps/.brand-assets) isn't an Nx project;
          // apps import Rocco's PNGs from it. Whitelist it so the "external resource
          // via relative path" guard doesn't flag the one legit shared-asset case.
          allow: ["../.brand-assets/*", "../../.brand-assets/*"],
          depConstraints: [
            { sourceTag: "type:lib", onlyDependOnLibsWithTags: ["type:lib"] },
            {
              sourceTag: "type:service",
              onlyDependOnLibsWithTags: ["type:lib", "type:service"],
            },
            {
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: ["type:lib", "type:service"],
            },
            {
              sourceTag: "type:package",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
          ],
        },
      ],
    },
  },
  // LAST: disable every ESLint rule Oxlint now owns (derived from .oxlintrc.json).
  ...oxlint.buildFromOxlintConfigFile(oxlintConfigPath),
];
