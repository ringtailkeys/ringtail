import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";

/**
 * docs-sync — the teeth behind "Docs are part of done" (CLAUDE.md / AGENTS.md).
 *
 * It derives the ACTUAL public surface FROM CODE (never a hardcoded duplicate list)
 * and asserts every item is documented in `apps/docs`. If code exposes something the
 * docs don't mention, this FAILS naming the undocumented item — the same "enforced,
 * not suggested" ethos as the boundary lint and `check:no-leak`.
 *
 * Surfaces checked (single source of truth in parens):
 *   - MCP tool names            → services/daemon/src/mcp.ts (registerTool calls)
 *   - CLI command names         → packages/cli/src/index.ts (the run() dispatch)
 *   - Step kinds                → libs/core/src/wizard.ts (StepKindSchema enum)
 *   - Manifest providers        → .env.example keys ∩ libs/recipes (recipe.envVars)
 *
 * ponytail: reads sources as FILES + regex rather than importing them — a root-level
 * script sits outside every Nx project, so it can read across daemon/cli/core/recipes
 * without tripping the module-boundary lint (packages/cli is terminal — unimportable).
 * NO secret values are ever touched (the guarantee stays intact).
 */

const ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** All quoted strings inside a `[...]` list literal. */
function quotedIn(list: string): string[] {
  return [...list.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

// ── derive the surface from code ─────────────────────────────────────────────

/** MCP tools: every tool registration in the daemon's MCP surface — matches both the
 *  raw `server.registerTool("name", …)` and the typed `tool("name", …)` wrapper. */
const mcpTools = [
  ...read("services/daemon/src/mcp.ts").matchAll(/\btool(?:<[^>]*>)?\(\s*server\s*,\s*["']([^"']+)["']/g),
].map((m) => m[1]);

/** CLI commands: the literals the run() dispatch compares argv against (`up`, `plan`). */
const cliCommands = [
  ...new Set(
    [
      ...read("packages/cli/src/index.ts").matchAll(/cmd\s*(?:===|!==)\s*["']([a-z][a-z-]*)["']/g),
    ].map((m) => m[1]),
  ),
];

/** Step kinds: the `StepKindSchema = z.enum([...])` members. */
const stepKinds = quotedIn(
  read("libs/core/src/wizard.ts").match(/StepKindSchema\s*=\s*z\.enum\(\[([^\]]+)\]/)![1],
);

/** Manifest providers: recipes whose env vars appear in `.env.example`. Recipe.envVars
 * is the declared single source of truth linking each manifest key to its provider. */
const manifestKeys = new Set(
  [...read(".env.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
);
const recipeDir = "libs/recipes/src/recipes";
const manifestProviders = readdirSync(join(ROOT, recipeDir))
  .filter((f) => f.endsWith(".ts") && !f.includes(".test.") && f !== "mock.ts")
  .map((f) => read(join(recipeDir, f)))
  .map((src) => ({
    id: src.match(/\bid:\s*["']([^"']+)["']/)![1],
    envVars: quotedIn(src.match(/envVars:\s*\[([^\]]*)\]/)?.[1] ?? ""),
  }))
  .filter((r) => r.envVars.some((v) => manifestKeys.has(v)))
  .map((r) => r.id);

// ── read the docs corpus ─────────────────────────────────────────────────────

function mdxFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? mdxFiles(join(dir, e.name))
      : e.name.endsWith(".mdx")
        ? [join(dir, e.name)]
        : [],
  );
}
const docs = mdxFiles("apps/docs/content/docs")
  .map((f) => read(f))
  .join("\n")
  .toLowerCase();

const documented = (item: string) => docs.includes(item.toLowerCase());

// ── the assertions ───────────────────────────────────────────────────────────

const surfaces: Array<[string, string[]]> = [
  ["MCP tool", mcpTools],
  ["CLI command", cliCommands],
  ["Step kind", stepKinds],
  ["manifest provider", manifestProviders],
];

// Sanity: the derivation must actually find a surface (a broken regex would make the
// gate vacuously pass). Catches "we refactored and the check silently stopped biting".
test("public surface is non-empty (derivation works)", () => {
  for (const [name, items] of surfaces) {
    expect(items.length, `derived no ${name}s — regex out of sync with the code?`).toBeGreaterThan(
      0,
    );
  }
});

test("every public-surface item is documented in apps/docs", () => {
  const undocumented = surfaces.flatMap(([name, items]) =>
    items.filter((i) => !documented(i)).map((i) => `${name} "${i}"`),
  );
  expect(
    undocumented,
    `Undocumented public surface — add to README.md + apps/docs in the same change:\n  ${undocumented.join("\n  ")}`,
  ).toEqual([]);
});
