# Changelog

All notable changes to Ringtail are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every user-visible change gets an entry under `## [Unreleased]` in the SAME change that
makes it (see `CLAUDE.md` → "Docs are part of done — enforced"). A release renames
`[Unreleased]` to the version and opens a fresh `[Unreleased]`.

## [Unreleased]

## [0.2.0] - 2026-07-16

### Fixed

- **The cockpit's live `/events` SSE stream no longer dies after 10 seconds.** Bun's default
  `idleTimeout` was killing the long-lived stream (`ERR_INCOMPLETE_CHUNKED_ENCODING` in the
  browser), leaving the dashboard blank or stale until refresh. The daemon now serves with
  `idleTimeout: 0` (loopback-only bind, so unbounded idle is safe).
- **A `mintKey` action authored without a `{{ROOT}}` header now says so.** A 401/403 from the
  provider used to be reported as "root key lacks the required permission/scope" even when the
  real cause was that no `{{ROOT}}` placeholder appeared in the action's headers, so the root
  was never attached. The error now names the authoring gap and shows the fix.

### Changed

- **Browser mint now consumes the published `@envoyage/browser` SDK.** Both browser modes
  (`RINGTAIL_BROWSER_MODE=local|cloud`) are the SAME fetch+SSE client against a running Envoyage
  **engine**, differing only by endpoint (the deploy model's "swap a URL"): `local` spawns/points at
  a local `envoyage serve`; `cloud` points at the hosted Envoyage endpoint
  (`RINGTAIL_ENVOYAGE_URL` + `RINGTAIL_ENVOYAGE_TOKEN`). The password-blind boundary and human-needed
  detection now live in the engine — the SDK's `human-needed` masking is authoritative.
- **Cockpit live-view now flows over the daemon's existing `/events` SSE channel.** The browser
  mint's frames/cursor/narration come from the consumed `@envoyage/browser` SDK session's
  `frame`/`cursor` events, piped through the daemon onto the same token-gated snapshot the dashboard
  already reads — no separate live-view transport. The `BrowserHandoff` card paints the real masked
  page image + Rocco cursor when a live engine is running, falling back to the recorded mock otherwise.

### Removed

- **The dead live-view WebSocket path** (`envoyageWsUrl()` + the `RINGTAIL_ENVOYAGE_WS_PORT` env var
  + the `wsUrl` field on the browser-mint session). Frames now ride the `/events` SSE snapshot; there
  is no `--ws-port` stream to point at.
- **The direct CF-CDP cloud browser path** (`libs/core/src/cloud-browser.ts`) and its ported
  `HUMAN_NEEDED_JS` in-page probe. `cloud` no longer drives a Cloudflare browser over CDP directly —
  it consumes the hosted Envoyage engine like `local` does.
- **`CF_ACCOUNT_ID` / `CF_API_TOKEN`** env vars (were only used by the deleted CF-CDP path).
