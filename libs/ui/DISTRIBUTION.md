# Consuming `@ringtail/ui` outside this monorepo

`ringtail-site/apps/app` (a **separate private repo**, Next.js) needs the Night Shift
design system — tokens, `AccountView`, `UpgradeModal`, Rocco, the spring motion. This
doc is the recommended mechanism + the exact steps to consume it.

## The dependency graph (why this is easy)

`@ringtail/ui` is **fully self-contained**:

- Only non-relative runtime import across the whole lib is **`react`** (a peer dep).
- **No `@ringtail/*`** imports — every component takes structural props, never `core`'s
  types (that separation is deliberate: `actions.tsx`, `chat.tsx` say so). So pulling
  `@ringtail/ui` does **not** drag in `@ringtail/core`, the daemon, the store, or any
  node-only code.
- The only non-code assets are **Rocco's PNG stickers** (`src/assets/*.png`), imported
  as URL strings — the one thing a raw-source consumer would have to teach its bundler.

Because the graph is this clean, the heavy options are unnecessary.

## Options weighed

| Option | Verdict |
| --- | --- |
| **(a) Publish `@ringtail/ui` to npm, bundled** | ✅ **Recommended.** One package, one import surface, real semver. tsup inlines the PNGs → the tarball is self-contained, consumer needs zero asset config. React stays a peer dep (one React in the host app). |
| (b) Split a slim `@ringtail/design-tokens` + a components subset | ❌ Premature. There's nothing heavy to slim away — no `core`, no node. `tokens.ts` is already a zero-dep module; a tokens-only consumer just imports `{ moonlit, cssVars }` from `@ringtail/ui` and tree-shakes the rest (`sideEffects: false`). Splitting = two packages to version in lockstep for no gain. |
| (c) git submodule / `file:`../ path / copy-paste | ❌ Worst cross-repo DX. No semver, no clean update path, and the private `apps/app` repo can't reach this repo's tsconfig `paths`. |

**Recommended: (a).** Publish `@ringtail/ui` as a bundled npm package.

## What's already prepared here

- **`package.json`** — `peerDependencies: react`, `sideEffects: false`, `files: ["dist"]`,
  and a **`publishConfig`** that OVERRIDES `exports` / `main` / `types` to `./dist` **at
  publish time only**. The default `exports` still points at `./src` so the monorepo
  (Storybook, Vite, tsconfig paths) keeps consuming source with zero build step.
- **`tsup.config.ts`** — ESM + `.d.ts`, `react` external, **PNGs inlined as data URIs**.
- Public API is the **`src/index.ts` barrel only** — deep imports stay closed.

## Steps to actually publish (NOT run here — prepared only)

The package is still `"private": true` as a safety guard. To publish:

```bash
cd libs/ui
bun add -D tsup            # 1. the only build-tool dep (kept out of the repo until publish)
# 2. remove "private": true from package.json  (publishConfig makes access public)
bun run build:dist        # 3. emits ./dist/index.js + index.d.ts, PNGs inlined
npm publish               # 4. publishConfig.exports → the ./dist entrypoint ships
```

(Or wire an npm org / scoped registry + a CI release job instead of a manual publish.)

## Steps `apps/app` uses to consume it

```bash
# in ringtail-site/apps/app
npm i @ringtail/ui react react-dom
```

```tsx
import { AccountView, cssVars, moonlit, allKeyframes } from "@ringtail/ui";

export default function AccountPage() {
  return (
    <>
      {/* mount the theme tokens + keyframes once (e.g. in the root layout) */}
      <style>{cssVars(moonlit)}</style>
      <style>{allKeyframes}</style>
      <AccountView
        tier={account.tier}                 // straight from the web app's own /api call —
        email={account.email}               // AccountView is data-source-agnostic, so it
        expiresAt={account.expiresAt}        // does NOT care that there's no daemon here
        usage={account.usage}
        onManageBilling={() => openPortal()} // web app hits /api/portal directly
        onSignOut={() => signOut()}
      />
    </>
  );
}
```

That's the whole point of `AccountView` being **presentational + data-source-agnostic**:
the daemon-fed dashboard wires it from the SSE snapshot; `apps/app` wires it from a plain
API call. Same component, same brand, one source of truth.

### Note on React Server Components

The components are client components (hooks + inline event handlers). In the Next App
Router, import them from a file with `"use client"` (or wrap the account page in one).
```
