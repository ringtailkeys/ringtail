# Ringtail — agent guide

Ringtail is a **local, open-source, agent-orchestrated credential-provisioning tool**.
Your coding agent (Rocco, the raccoon) reads `.env.example` as the manifest, raids each
provider's **official** token page — never browser-bots — scope-validates every key,
and syncs it into `.env.local` **and** Infisical across dev / staging / prod. One human
"allow" per provider, then zero-touch.

Canonical domain: **ringtailkeys.com** · npm scope: `@ringtail` · CLI: `ringtail`

## ZERO TELEMETRY — non-negotiable

This is a credentials tool. **No analytics. No phone-home. No usage pings. Ever.**
Do not add PostHog, Sentry, Segment, or any SDK that emits a network call we don't
strictly need to provision a key. If a dependency does telemetry by default, disable it
or drop the dependency. Trust is the product; one silent beacon breaks it.

## The map — four buckets

| Bucket | Rule | What lives here |
| --- | --- | --- |
| `apps/` | served to **humans** (a UI) | `dashboard` — the local Vite+React cockpit |
| `services/` | served to **machines** (a URL) | `daemon` — Hono; reads `$PORT` |
| `libs/` | **shared, never served** | `config`, `ui`, `store`, `sinks`, `recipes`, `core` |
| `packages/` | **shipped to third parties** | `cli` — `@ringtail/cli`, bin `ringtail` |

## The three laws

1. **No upward import.** A lib never imports an app/service; the dependency arrow only
   points down the table above.
2. **One public door.** Every package exposes exactly one barrel — `src/index.ts`.
   Import `@ringtail/store`, never `@ringtail/store/src/whatever`.
3. **By feature, not by layer.** Group files by the thing they do, not by `controllers/`
   `models/` `utils/` strata.

## The boundary is ENFORCED, not suggested

`@nx/enforce-module-boundaries` (in `eslint.config.mjs`) reads each package's
`nx.tags` (`type:app|service|lib|package`) and makes an illegal import a **lint error**:

- `type:lib` → libs only
- `type:service` → libs + services
- `type:app` → libs + services (not other apps)
- `type:package` → libs only, and **terminal** (nothing internal may import it)

`tsconfig.base.json` `paths` must start with `./` — a bare path throws **TS5090**.
`lefthook` blocks the commit/push if format, lint, or typecheck fails. Run `bun run check`.

## Package manager & dev

- **bun** only (never npm). `bun install` at root.
- Dev servers: **`./tilt_up.sh`** — never `tilt up` directly. Served roles get stable
  portless URLs; nothing pins a service port (read `$PORT`).
