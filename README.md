# Ringtail 🦝

**He raids the token pages so you don't.**

Ringtail is a **local, open-source, agent-orchestrated credential-provisioning tool**.
Your coding agent's little raccoon (Rocco) reads `.env.example` as the shopping list,
raids each provider's token page via their **official APIs** — never browser-bots —
scope-validates every key, and stashes it into `.env.local` **and** Infisical across
dev, staging, and prod. **One human "allow" per provider, then zero-touch forever.**

The anti-vault: instead of a cold enterprise locker you fill by hand, a competent little
bandit goes and gets the keys for you.

- 🏠 **Local** — runs on your machine, keys stored in `~/.ringtail` (mode `0600`).
- 📖 **OSS** — this repo (`ringtailkeys/ringtail`) is public.
- 🚫 **Zero telemetry** — no analytics, no phone-home, ever. Trust is the product.

Canonical home: **[ringtailkeys.com](https://ringtailkeys.com)** · CLI: `ringtail` ·
npm scope: `@ringtail`

## Structure — four buckets

The [builders-stack](https://github.com/ringtailkeys) "run vs ship" taxonomy, boundaries
enforced by Nx tags + `@nx/enforce-module-boundaries` (an illegal import is a lint error):

| Path | Served to | What |
| --- | --- | --- |
| `apps/dashboard` | humans | Vite+React local cockpit — a providers×envs connection grid |
| `services/daemon` | machines (a URL) | Hono; `/health`, `/api/status`, OAuth callback |
| `libs/config` | — (shared) | env schema / `getEnv()` |
| `libs/ui` | — (shared) | design tokens + `Button` |
| `libs/store` | — (shared) | `~/.ringtail` creds, `0600` |
| `libs/sinks` | — (shared) | `writeEnvLocal` + `writeInfisical(env)` |
| `libs/recipes` | — (shared) | `Recipe` interface + a worked example |
| `libs/core` | — (shared) | the acquire→validate→provision→sync state machine |
| `packages/cli` | third parties | `@ringtail/cli`, bin `ringtail` |

**Three laws:** no upward import · one public door (`src/index.ts` barrel) · by feature,
not by layer. See [`CLAUDE.md`](./CLAUDE.md) for the full agent guide.

## Quickstart

```bash
bun install
./tilt_up.sh          # boots the daemon + dashboard via portless (never `tilt up`)
```

Verify the whole tree: `bun run check` (typecheck + boundary lint).

---

Mascot art: `apps/.brand-assets/rocco-*.png`. Brand source: `docs/brand/` (`_bible.md`
is the root; soul / voice / design-lock derive from it).
