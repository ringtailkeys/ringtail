import { docs } from "@/.source/server";
import { loader } from "fumadocs-core/source";

/**
 * The doc tree loader. `docs` is codegen'd into `.source/` by fumadocs-mdx from
 * `content/docs`; `toFumadocsSource()` adapts it to a fumadocs-core Source that
 * powers the page tree, `getPage`, static params, and search. Base route: `/docs`.
 */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
