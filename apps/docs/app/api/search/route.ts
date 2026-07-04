import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

/** Static, client-side search over the doc tree (no server needed at runtime —
 *  fits a Cloudflare Pages static export). */
export const { GET } = createFromSource(source);
