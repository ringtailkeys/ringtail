import { defineConfig } from "tsup";

/**
 * Publish build for @ringtail/ui — turns the raw TS source into a self-contained,
 * web-consumable ESM bundle (+ .d.ts) so an EXTERNAL repo (ringtail-site/apps/app,
 * a separate private Next.js app) can `npm i @ringtail/ui` and import components
 * with NO knowledge of this monorepo's tsconfig paths.
 *
 * Why this shape (see DISTRIBUTION.md):
 *  - `format: esm` — the whole system is ESM; every consumer (Next 15, Vite) is too.
 *  - `dts: true` — ships types; the public API is the index.ts barrel only.
 *  - `external: react` — react is a PEER dep, never bundled (one React in the host app).
 *  - `loader { .png: dataurl }` — Rocco's sticker PNGs are INLINED as data URIs, so the
 *    tarball is fully self-contained: the consumer needs zero asset/loader config.
 *
 * Dev is unaffected: the package's default `exports` still points at ./src (Storybook,
 * Vite, tsconfig paths). This build only feeds publishConfig.exports on `npm publish`.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react/jsx-runtime"],
  loader: { ".png": "dataurl" },
});
