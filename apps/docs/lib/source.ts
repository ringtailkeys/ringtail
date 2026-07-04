import { docs } from "@/.source";
import { loader } from "fumadocs-core/source";

/**
 * The doc tree loader. `docs` is codegen'd into `.source/` by fumadocs-mdx from
 * `content/docs`; `toFumadocsSource()` adapts it to a fumadocs-core Source that
 * powers the page tree, `getPage`, static params, and search. Base route: `/docs`.
 *
 * ponytail: version bridge. We pin fumadocs-core/ui at 15.8.5 (the last 15.x — the
 * newest line that still supports React 18, which the rest of the monorepo is on),
 * but fumadocs-mdx 11.10.1 already emits the core-16 Source shape where `.files` is a
 * lazy FUNCTION; core 15.8.5's loader expects `files` to be an ARRAY and `.map`s it
 * directly. So normalise here: call it if it's a function. Drop this the day the
 * monorepo moves to React 19 and we can take fumadocs 16 wholesale.
 */
const mdxSource = docs.toFumadocsSource();
const filesProp: unknown = mdxSource.files;
const files = (
  typeof filesProp === "function" ? (filesProp as () => unknown)() : filesProp
) as typeof mdxSource.files;

export const source = loader({
  baseUrl: "/docs",
  source: { ...mdxSource, files },
});
