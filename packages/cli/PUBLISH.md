# Publishing the `ringtailkeys` CLI

Package name **`ringtailkeys`**, bin **`ringtail`** (both verified free on npm).

Releases are **hands-free**: press the Tilt **`release`** button → it bumps + tags +
pushes → the pushed `v*` tag fires **`.github/workflows/publish.yml`** → the Action
publishes to npm via **OIDC Trusted Publishing**. **No npm token lives anywhere** —
not on your machine, not in a GitHub secret. There is no local `npm publish` (esbuild
HANGS on this mac; the Action builds + publishes on a Linux runner).

Requires **npm ≥ 11.5** for Trusted Publishing (the Action installs `npm@latest`).

## The published path (off-clone)

```bash
npx ringtailkeys up          # or: npm i -g ringtailkeys && ringtail up
```

`up` boots the **bundled daemon** (`dist/daemon.js`) with `RINGTAIL_SERVE_DIST`
pointed at the **prebuilt dashboard** (`dist/dashboard`). One process, one origin:
the daemon serves the dashboard + `/api` + `/events` + `/mcp` and prints the MCP
URL + bearer token. No repo, no build step, no network fetch of code.

## The clone path (dev)

```bash
git clone https://github.com/ringtailkeys/ringtail
cd ringtail && bun install
bun packages/cli/src/index.ts up
```

Off a clone there is no `dist/daemon.js`, so `up` falls back to the repo walk: boot
the daemon from `services/daemon/src/index.ts` and build `apps/dashboard/dist` once.

## How the tarball is built (`prepack`)

`bun run prepack` produces everything the published package ships, all with **bun's
bundler** (esbuild's native binary HANGS on the dev mac — verified; the CI runner is
Linux, where esbuild is fine, but `prepack` uses bun there too for consistency):

- `build`        → `bun build src/cli.ts → dist/cli.js` (bin, `#!/usr/bin/env bun`).
- `build:daemon` → `bun build services/daemon/src/index.ts → dist/daemon.js`, a
  standalone bundle (libs + hono + zod + MCP SDK inlined). Crosses the
  `type:package → service` boundary via a **build-time bundle**, not a workspace
  import — nothing in `src/` imports the daemon, so the boundary lint stays green.
- `build:dashboard` → Vite-builds `apps/dashboard` → `dist/dashboard`.

`files: ["dist"]` ships only the built artifacts.

## The clean-install smoke gate (why a broken install can't ship)

`0.1.0` shipped **broken**: its `package.json` had `workspace:*` **runtime** deps npm
can't resolve, so a stranger's `npm i ringtailkeys` failed — yet every gate
(typecheck/lint/tests/tag-match) passed, because **nothing installed the packed
tarball in a clean environment**.

So **the pipeline now pack-installs and boots the tarball before publishing — a broken
install blocks the release.** Between `prepack` and `npm publish`, `publish.yml` runs a
**fail-closed smoke gate**; any failure exits non-zero → the job fails → `npm publish`
never runs:

1. `npm pack` → `ringtailkeys-<version>.tgz`.
2. In a fresh `mktemp -d` **outside** the workspace: `npm init -y` then
   `npm i <tarball>` — a `workspace:*` (or any unresolvable) dep makes this exit
   non-zero. Then assert `node_modules/.bin/ringtail` exists.
3. Boot the **installed** bin (`ringtail up`), parse the `http://127.0.0.1:<port>`
   origin it prints, `curl` the daemon `/health` and assert `{"ok":true}`, then stop
   it. If the daemon never comes up, the gate fails.
4. Assert the packed `package.json` has **no** runtime `dependencies` value using the
   `workspace:` protocol — a cheap direct check of the exact `0.1.0` failure.

---

## ONE-TIME bootstrap (do this once, before the button ever works)

Trusted Publishing can only link to a package that **already exists** on npm, so
version `0.1.0` must be published by hand first, from a machine where esbuild works
(a Linux box or CI-equivalent — NOT the dev mac where it hangs):

```bash
cd packages/cli
bun run prepack                         # build cli + daemon + dashboard bundles
npm publish --access public --otp=<6-digit-2FA>
```

Then **link the Trusted Publisher** on npm (this is what removes the need for a token):

1. Sign in on **npmjs.com** → go to the package **`ringtailkeys`**.
2. **Settings** → **Trusted Publisher** → **Add / GitHub Actions**.
3. Fill in:
   - **Organization / user**: `ringtailkeys`
   - **Repository**: `ringtail`  (i.e. `ringtailkeys/ringtail`)
   - **Workflow filename**: `publish.yml`
   - **Environment**: leave blank (the workflow declares no `environment:`).
4. Save. From now on GitHub Actions running `publish.yml` in that repo can publish
   `ringtailkeys` **without any token** — npm verifies the workflow's OIDC identity.

## The ongoing flow (every release after the bootstrap)

1. Be on **`master`** with a **clean working tree**.
2. Press the Tilt **`release`** button (or **`release-minor`** for a feature bump).
   It runs the preflight (typecheck + lint + no-leak + cli tests + clean-tree +
   on-master), then `npm version patch|minor --tag-version-prefix=v`, then
   `git push --follow-tags`.
3. The pushed `v<x>` tag fires **`publish.yml`**, which: checks out, sets up Bun +
   Node with `npm@latest`, guards that the tag matches `packages/cli/package.json`
   version, runs `bun run prepack`, then
   `npm publish --provenance --access public` — **no token**, OIDC does the exchange.
4. Watch the repo **Actions** tab. Provenance is attested automatically.

For a **major** bump there's no button — run it by hand, then push:

```bash
cd packages/cli && npm version major --tag-version-prefix=v -m "release: ringtailkeys v%s"
git push --follow-tags
```
