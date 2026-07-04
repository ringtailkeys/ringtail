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
};

export default withMDX(config);
