import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

/** Static, client-side search over the doc tree (no server needed at runtime —
 *  fits a Cloudflare Pages static export). `staticGET` exports the search index
 *  as a static JSON at /api/search; the client (RootProvider `type: "static"` in
 *  app/layout.tsx) fetches it once and runs Orama in the browser. */
export const revalidate = false;
export const { staticGET: GET } = createFromSource(source);
