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

## Design system — Storybook-first (enforced)

All UI lives in the design system, reviewable in isolation before it's wired:

- **Every reusable UI element is a `@ringtail/ui` component** (bespoke ones too). Screens
  **compose** `@ringtail/ui` — they never inline reusable UI or duplicate styles. A component
  is **incomplete** until it's in `libs/ui`, **has a Storybook story**, AND is used in an app
  (in the design system, in Storybook, *and* used — all three).
- **Every new screen/flow ships a Storybook demo.** Build the screen's view as a presentational
  `@ringtail/ui` component driven by swappable `mock-*` state and story it — so the *whole
  screen* is reviewable with **no daemon, no keys, no network** (which also keeps the
  ZERO-TELEMETRY line honest — a screen you can review offline can't be phoning home). The app
  page then only wires data + composes that view. Because a `lib` can't import an `app` (law 1),
  storying a screen *means* lifting its view into `libs/ui` — that's the point.

## The boundary is ENFORCED, not suggested

`@nx/enforce-module-boundaries` (in `eslint.config.mjs`) reads each package's
`nx.tags` (`type:app|service|lib|package`) and makes an illegal import a **lint error**:

- `type:lib` → libs only
- `type:service` → libs + services
- `type:app` → libs + services (not other apps)
- `type:package` → libs only, and **terminal** (nothing internal may import it)

`tsconfig.base.json` `paths` must start with `./` — a bare path throws **TS5090**.
`lefthook` blocks the commit/push if format, lint, or typecheck fails. Run `bun run check`.

## Docs are part of done — enforced

If you change the public surface — CLI commands, MCP tools, the `Wizard`/`Step`/`Action`
contract, the `.env.example` manifest, or the onboarding flow — you MUST update `README.md`
and `apps/docs` in the SAME change. Docs live with the code; stale docs are a bug. CI enforces
it via `check:docs` (a `docs-sync` test derives the surface from the code and fails naming any
undocumented item, then `apps/docs` builds for broken-link/MDX safety).

## Package manager & dev

- **bun** only (never npm). `bun install` at root.
- Dev servers: **`./tilt_up.sh`** — never `tilt up` directly. Served roles get stable
  portless URLs; nothing pins a service port (read `$PORT`).
