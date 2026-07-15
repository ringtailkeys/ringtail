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
it via `check:docs`. Also carry, in the SAME change: a **`CHANGELOG.md`** entry under
`## [Unreleased]` (Keep a Changelog + SemVer) for every user-visible change, and — when the
HTTP/MCP surface changes — both the **OpenAPI** spec (`api-collections/openapi/daemon.yaml`) and
the **Bruno** collection (`api-collections/services/daemon/`) in lockstep. Full rule in [`CLAUDE.md`](./CLAUDE.md).

bun only. Dev via `./tilt_up.sh` (never `tilt up`). Verify with `bun run check`.
Canonical domain: **ringtailkeys.com**.

## 5. CI / Deploy / Release

Three separate pipelines — keep them straight.

### CI — GitHub Actions (`ci.yml`, no deploy)
`ci.yml` runs on PR + push to `main`: `verify` (typecheck · module-boundary lint ·
`check:no-leak` THE GUARANTEE · offline E2E in `libs/core`) and `docs` (`check:docs`:
docs-sync + `apps/docs` builds). **CI never deploys and never publishes.** Do not edit
`ci.yml` / `publish.yml` for this — they are correct; this section only documents them.

### Release — OIDC Trusted Publishing (`publish.yml`, tokenless)
The tool ships ONE npm package, **`ringtailkeys`** (`packages/cli`; every `libs/*` is
`private`, nothing else publishes). Release is hands-free:

- **Trigger:** the Tilt **`release`** / **`release-minor`** button (from `main`, clean
  tree) preflights, bumps + tags `v<x>`, and `git push --follow-tags`. The pushed `v*` tag
  fires `publish.yml` on a **Linux** runner (esbuild hangs on the dev mac).
- **How it publishes:** `id-token: write` + `npm publish --provenance --access public`.
  **No npm token anywhere** — npm verifies the workflow's OIDC identity against the Trusted
  Publisher configured on the package. The job fail-closes: tag-vs-version guard, then a
  pack + clean-install + boot-the-tarball smoke gate (the exact `0.1.0` `workspace:*` break)
  BEFORE `npm publish` runs.
- **One-time bootstrap (founder, manual — once, then tokenless forever):** Trusted Publishing
  can only link an EXISTING package, so `0.1.0` is published by hand once from a Linux/CI-equiv
  box (`npm publish --access public --otp=<2FA>`), then npmjs.com → `ringtailkeys` → Settings →
  **Trusted Publisher** → GitHub Actions (`ringtailkeys/ringtail`, workflow `publish.yml`, no
  environment). After that every release is tokenless. Full detail: `packages/cli/PUBLISH.md`.

### Deploy — the tool does NOT deploy to Cloudflare
Ringtail is a **local** OSS tool: it installs via `npx ringtailkeys` and runs on the user's
machine. There is **no `deploy.sh`** and no CF runtime here — that lives in the sibling
`../ringtail-site` (the hosted half). The one exception is the docs site `apps/docs`, which
deploys to `docs.ringtailkeys.com` on CF Pages via its own **`apps/docs/DEPLOY.md`** — that is
a docs-publishing step, not a product deploy, and stays self-contained there.

### `dev_up.sh` — intentionally absent here
This repo has only **`./tilt_up.sh`** (tool standalone, Tilt UI `10450`). The multi-repo
**umbrella lives in the site**: `../ringtail-site/dev_up.sh` `include()`s this tool's
`.devops/Tiltfile`, so `./dev_up.sh` from the site boots tool + site together (UI `10452`).
Adding a `dev_up.sh` here too would be a second umbrella pointing the other way — redundant and
a port fight. Boot the tool alone with `./tilt_up.sh`; boot the whole stack from the site.
