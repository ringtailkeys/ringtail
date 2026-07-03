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

bun only. Dev via `./tilt_up.sh` (never `tilt up`). Verify with `bun run check`.
Canonical domain: **ringtailkeys.com**.
