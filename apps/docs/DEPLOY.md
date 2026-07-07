# Deploying @ringtail/docs

The docs site is intended to live at **docs.ringtailkeys.com** via **Cloudflare Pages**.

- **Build command:** `bun run build` (runs `fumadocs-mdx` codegen, then `next build`).
- **Node/Bun:** matches the repo toolchain (`.tool-versions` — bun `1.1.34`, node `20.11.1`).

## Before this can deploy to Cloudflare Pages — one open decision

This is a **Next.js App Router** app (`next.config.mjs` has no `output: "export"`), so a bare
`next build` emits a **server** build (`.next`), not a static site. Cloudflare Pages cannot serve
that as-is. The site's search being static (`createFromSource`) does **not** make the whole app
static — the routes still render through Next. You must pick one of two paths first:

1. **Static export** — set `output: "export"` in `next.config.mjs` and build a fully static site
   (Fumadocs supports this; App Router routes need `generateStaticParams`). Cloudflare Pages then
   serves the exported `out/` directory with no runtime. Simplest for pure docs.
2. **Adapter** — add `@cloudflare/next-on-pages` and build with it, so the app runs on Cloudflare
   Pages Functions (needed if any route stays dynamic).

Neither is configured today. **Until one is wired in, `bun run build` alone is not deployable to
Cloudflare Pages.** Wiring it touches `next.config.mjs` / `package.json` (code) — out of scope for
this docs pass; flagged here so the deploy owner does it deliberately.

## Local preview

Goes through Tilt like every other served role — `./tilt_up.sh` brings it up at
`http://docs.ringtail.localhost:1355` (never `tilt up` directly). This uses `next dev`, which runs
regardless of the export/adapter decision above.

## User action (not done here)

Creating the Cloudflare Pages project, connecting the repo, and binding the
`docs.ringtailkeys.com` custom domain + DNS are done in the **Cloudflare dashboard**, not in this
repo — a human action. This file is the record of where it lands, not an automated deploy.
