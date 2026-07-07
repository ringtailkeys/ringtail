# Deploying @ringtail/docs

The docs site lives at **docs.ringtailkeys.com** on **Cloudflare Pages**, served as a
**fully static export** — no server, no Pages Functions, no edge runtime.

## Why static export (not `@cloudflare/next-on-pages`)

This is a Next.js App Router (Fumadocs) app, but every route is prerenderable:

- `/docs/[[...slug]]` — all MDX, driven by `generateStaticParams()`.
- `/api/search` — Fumadocs' **`staticGET`** exports the Orama search index as a static
  JSON at build time; the browser fetches it once and searches client-side
  (`RootProvider search={{ options: { type: "static" } }}` in `app/layout.tsx`).
- `/` — a client-side redirect to `/docs` (the real 302 is done at the edge, below).

Because nothing needs a running server, `output: "export"` (in `next.config.mjs`) is the
simplest correct choice: `next build` emits a static site into `out/`, and Cloudflare Pages
serves that directory directly. The `@cloudflare/next-on-pages` adapter would only be needed
if a route stayed dynamic (server components hitting a request, edge functions, ISR) — none do.

## What's wired in this repo

| File | Role |
| --- | --- |
| `next.config.mjs` | `output: "export"` → static `out/` |
| `app/api/search/route.ts` | `export const { staticGET: GET }` + `revalidate = false` |
| `app/layout.tsx` | `RootProvider search={{ options: { type: "static" } }}` |
| `app/page.tsx` | client-side `/` → `/docs` redirect (export-safe) |
| `public/_redirects` | edge `/  /docs  302` (copied into `out/`) |
| `wrangler.toml` | `name = "ringtail-docs"`, `pages_build_output_dir = "out"` |
| `deploy.sh` | token-from-env build + `wrangler pages deploy` + smoke test |

## Build

```bash
cd apps/docs
bun run build          # fumadocs-mdx codegen, then `next build` → apps/docs/out/
```

The build script is unchanged (`fumadocs-mdx && next build`); with `output: "export"` the
same `next build` now writes a static `out/` instead of a `.next` server build.

> **Local note:** the esbuild native binary can hang on some macOS machines (a zombie
> `esbuild --service` never returns), which stalls `next build` locally. CI/Linux builds fine.
> If a local build hangs, kill stray `esbuild` procs and rely on CI, or build in a Linux container.

## Deploy

```bash
cd apps/docs
./deploy.sh            # builds, deploys out/ to Pages, smoke-tests docs.ringtailkeys.com/docs
```

`deploy.sh` sources `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` from repo-root
`.env.local`, builds, runs `bunx wrangler pages deploy out --project-name ringtail-docs`, and
curls the live URL for a `200`. **No `wrangler login`** — auth is the env token only.

### Required env vars

| Var | Where |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | scoped token with **Account → Cloudflare Pages → Edit** (and DNS:Edit if you bind the domain via CLI) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → account id |

Both are listed (names only) in the repo-root `.env.example`.

## One-time user action (Cloudflare dashboard)

1. **Create the Pages project** named **`ringtail-docs`** (must match `wrangler.toml`).
   First deploy can be `./deploy.sh` (direct-upload) — no Git connection required.
2. **Bind the custom domain** `docs.ringtailkeys.com`:
   Pages → the project → *Custom domains* → add `docs.ringtailkeys.com`. Since the
   `ringtailkeys.com` nameservers are already on Cloudflare, the `docs` CNAME/DNS record is
   created automatically and TLS is issued — no manual DNS edit needed.
3. **Mint a scoped API token** (My Profile → API Tokens → *Cloudflare Pages: Edit*), put it in
   `.env.local` as `CLOUDFLARE_API_TOKEN`, add `CLOUDFLARE_ACCOUNT_ID`, then run `./deploy.sh`.

## Local preview

Through Tilt like every other role — `./tilt_up.sh` brings it up at
`http://docs.ringtail.localhost:1355` (never `tilt up` directly). That uses `next dev`, which
ignores `output: "export"`, so the dev experience is unchanged.
