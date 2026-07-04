# Ringtail — agent guide (AGENTS.md)

**Single source of truth is [`CLAUDE.md`](./CLAUDE.md)** — read it. This file exists so
non-Claude agents find the same rules; it does not duplicate them, it restates the two
you must never violate.

## 1. ZERO TELEMETRY — non-negotiable

Ringtail is a credentials tool. **No analytics, no phone-home, no usage pings, ever.**
Never add PostHog / Sentry / Segment or any dependency that emits a network call we don't
strictly need to provision a key. Trust is the product.

## 2. The boundary is ENFORCED

Four buckets, dependency arrow points down only:

- `apps/` served to humans · `services/` served to machines (a URL) ·
  `libs/` shared never served · `packages/` shipped to third parties.
- Tag matrix (`nx.tags` + `@nx/enforce-module-boundaries`, a lint error if broken):
  `type:lib`→libs · `type:service`→libs+services · `type:app`→libs+services ·
  `type:package`→libs only + **terminal**.
- Three laws: **no upward import** · **one public door** (`src/index.ts` barrel) ·
  **by feature, not layer**.
- `tsconfig.base.json` paths start with `./` or TS5090 throws.

## 3. Storybook-first UI — enforced

Every reusable UI element is a `@ringtail/ui` component with a **Storybook story**; every new
screen ships a **Storybook demo** — its presentational view lifted into `libs/ui`, driven by
`mock-*` state, reviewable with **no daemon, keys, or network** (keeps ZERO-TELEMETRY honest).
Full rule in [`CLAUDE.md`](./CLAUDE.md).

## 4. Docs are part of done — enforced

If you change the public surface — CLI commands, MCP tools, the `Wizard`/`Step`/`Action`
contract, the `.env.example` manifest, or the onboarding flow — you MUST update `README.md`
and `apps/docs` in the SAME change. Docs live with the code; stale docs are a bug. CI enforces
it via `check:docs`. Full rule in [`CLAUDE.md`](./CLAUDE.md).

bun only. Dev via `./tilt_up.sh` (never `tilt up`). Verify with `bun run check`.
Canonical domain: **ringtailkeys.com**.
