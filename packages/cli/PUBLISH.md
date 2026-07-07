# Publishing the `ringtailkeys` CLI

Package name **`ringtailkeys`**, bin **`ringtail`** (both verified free on npm).
`private: true` stays in `package.json` — publishing is a deliberate action taken
from the **Tilt `npm-publish` button**, never a bare `npm publish`.

## The published path (off-clone) — now solved

```bash
npx ringtailkeys up          # or: npm i -g ringtailkeys && ringtail up
```

`up` boots the **bundled daemon** (`dist/daemon.js`) with `RINGTAIL_SERVE_DIST`
pointed at the **prebuilt dashboard** (`dist/dashboard`). One process, one origin:
the daemon serves the dashboard + `/api` + `/events` + `/mcp` and prints the MCP
URL + bearer token. No repo, no build step, no network fetch of code.

## The clone path (dev) — still works

```bash
git clone https://github.com/ringtailkeys/ringtail
cd ringtail && bun install
bun packages/cli/src/index.ts up
```

Off a clone there is no `dist/daemon.js` next to the source, so `up` falls back to
the repo walk: boot the daemon from `services/daemon/src/index.ts` and build
`apps/dashboard/dist` once (gitignored → a fresh clone has none; 5-min timeout,
then a clear error).

## How the tarball is built (`prepack`)

`bun run prepack` produces everything the published package ships, all with **bun's
bundler** (esbuild's native binary HANGS on this machine — verified — so it is not
used anywhere in this package):

- `build`       → `bun build src/cli.ts → dist/cli.js` (bin, `#!/usr/bin/env bun`).
- `build:daemon`→ `bun build services/daemon/src/index.ts → dist/daemon.js`, a
  standalone bundle (libs + hono + zod + MCP SDK all inlined). This crosses the
  `type:package → service` boundary on purpose but via a **build-time bundle**, not
  a workspace import — nothing in `src/` imports the daemon, so the boundary lint
  stays green.
- `build:dashboard` → Vite-builds `apps/dashboard` and copies it to
  `dist/dashboard`.

`files: ["dist"]` ships only the built artifacts.

At runtime `up` prefers the bundled `dist/daemon.js` + `dist/dashboard`; the
repo-walk (`findRepoRoot`) is the DEV/clone-only fallback.

## Publishing: the Tilt `npm-publish` button

Manual resource (`auto_init=False`, `TRIGGER_MODE_MANUAL`, label `infra`) in
`.devops/Tiltfile`. Click it to run, in order:

1. **preflight** — `nx run-many -t typecheck lint`, `check:no-leak`, and the cli
   tests must be green; PLUS a version guard that refuses to publish if
   `package.json` version already equals `npm view ringtailkeys version` (no
   clobber / no re-publish of an existing version).
2. **build** — `bun run build && bun run build:daemon && bun run build:dashboard`
   (the same artifacts `prepack` makes).
3. **publish** — `npm publish --access public` (uses your local `npm login`; also
   honors `NPM_TOKEN` / an `.npmrc` if present). `private:true` in the checked-in
   `package.json` is dropped for the publish so this stays the ONLY way to ship.
4. **smoke** — `npm view ringtailkeys`, then in a scratch dir
   `npx -y ringtailkeys up --json` (agent dry-run) against the PUBLISHED tarball —
   proves the off-clone install boots.

Bump `version` in `package.json` before clicking (the preflight version guard
enforces it).
