import { defineConfig, defineDocs } from "fumadocs-mdx/config";

/**
 * Fumadocs MDX source config. `content/docs` is the doc tree; `fumadocs-mdx`
 * codegens `.source/` from it (types + the runtime map) — run before typecheck
 * and build (see package.json scripts + next.config.mjs's createMDX plugin).
 */
export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
