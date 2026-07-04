# Deploying @ringtail/docs

The docs site deploys to **docs.ringtailkeys.com** via **Cloudflare Pages**.

- **Build command:** `bun run build` (runs `fumadocs-mdx` codegen, then `next build`).
- **Output:** the Next.js build. Search is static (`createFromSource`), so no server runtime is
  required for it.
- **Node/Bun:** matches the repo toolchain (`.tool-versions`).

Local preview goes through Tilt like every other served role — `./tilt_up.sh` brings it up at
`http://docs.ringtail.localhost:1355` (never `tilt up` directly).

> Live deploy config (the Pages project + custom domain) is set up in Cloudflare, not in this
> repo. This file is the record of where it lands.
