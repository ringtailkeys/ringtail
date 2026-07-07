import { createMDX } from "fumadocs-mdx/next";

/**
 * @ringtail/docs — the public docs site (Next.js App Router + Fumadocs MDX).
 * `createMDX` wires the fumadocs-mdx codegen (`.source/`) into the Next build.
 * Deployed to docs.ringtailkeys.com via Cloudflare Pages (see DEPLOY.md).
 */
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Fully static site → Cloudflare Pages serves the exported `out/` dir with no
  // runtime. Every route is prerendered: `/docs/[[...slug]]` via generateStaticParams,
  // and search via fumadocs' staticGET (see app/api/search/route.ts). See DEPLOY.md.
  output: "export",
  // `next dev` ignores `output: export`, so Tilt local preview is unaffected.
};

export default withMDX(config);
