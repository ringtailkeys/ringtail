# Publishing the `ringtail` CLI

The package is `private: true` today. Publishing is a deliberate, separate
decision — this doc records what's ready and what's still open.

## Until published: the clone path (works today)

```bash
git clone https://github.com/ringtailkeys/ringtail
cd ringtail
bun install
bun packages/cli/src/index.ts up
```

`up` walks to the monorepo root, builds `apps/dashboard/dist` once (it's
gitignored, so a fresh clone has none — 3-min timeout, then a clear error), and
boots the daemon in served mode. The daemon prints the MCP URL + bearer token
and serves the dashboard on one origin.

## What's prep'd for publish

- **`bin`** → `ringtail: ./dist/cli.js` (esbuild bundle of `src/cli.ts`, `#!/usr/bin/env bun`).
- **`prepack`** builds the CLI bundle AND the dashboard, copying it to
  `dist/dashboard` so the tarball ships a PREBUILT dashboard — a consumer needs
  no repo and no build step. `files: ["dist", "src"]` already includes it.
- At runtime `up` prefers the bundled `dist/dashboard`; the repo-walk is the
  DEV/clone-only fallback.

## Open decisions (do NOT publish before resolving)

1. **Package / bin name.** `@ringtail/cli` installs a `ringtail` bin — but
   `ringtail` (the bare bin) and the `ringtail.dev` domain belong to an
   unrelated third party. Options:
   - publish as `@ringtail/cli` but rename the bin to an **unsquatted** name we
     own, e.g. `ringtailkeys` (matches `ringtailkeys.com`), or
   - publish the whole package under a new unsquatted name.
   Whichever we pick, `bin` and all docs/README must use the same name.

2. **Bundled daemon.** `up` currently boots the daemon via the repo-walk
   (`services/daemon/src/index.ts`). A published package with no repo has no
   daemon to spawn. Before dropping `private`, either bundle the daemon into the
   package (note: crosses the `type:package → service` boundary — esbuild it
   into `dist/` as a standalone entry, don't add a workspace import) or ship the
   daemon as its own published package the CLI depends on. Until then, `up`
   without a repo prints a clear "run from a clone" error pointing here.

3. **Flip `private: true` → remove it**, and confirm `publishConfig.access:
   public`, only after 1 and 2 are settled.
