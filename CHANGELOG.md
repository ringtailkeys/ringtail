# Changelog

All notable changes to Ringtail are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every user-visible change gets an entry under `## [Unreleased]` in the SAME change that
makes it (see `CLAUDE.md` → "Docs are part of done — enforced"). A release renames
`[Unreleased]` to the version and opens a fresh `[Unreleased]`.

## [Unreleased]

Ringtail is pre-release — no versioned release has been cut yet. Track user-visible
changes here (CLI commands, MCP tools, daemon routes, the `.env.example` manifest,
onboarding) until the first tagged version.

### Changed

- **Browser mint now consumes the published `@envoyage/browser` SDK.** Both browser modes
  (`RINGTAIL_BROWSER_MODE=local|cloud`) are the SAME fetch+SSE client against a running Envoyage
  **engine**, differing only by endpoint (the deploy model's "swap a URL"): `local` spawns/points at
  a local `envoyage serve`; `cloud` points at the hosted Envoyage endpoint
  (`RINGTAIL_ENVOYAGE_URL` + `RINGTAIL_ENVOYAGE_TOKEN`). The password-blind boundary and human-needed
  detection now live in the engine — the SDK's `human-needed` masking is authoritative.

### Removed

- **The direct CF-CDP cloud browser path** (`libs/core/src/cloud-browser.ts`) and its ported
  `HUMAN_NEEDED_JS` in-page probe. `cloud` no longer drives a Cloudflare browser over CDP directly —
  it consumes the hosted Envoyage engine like `local` does.
- **`CF_ACCOUNT_ID` / `CF_API_TOKEN`** env vars (were only used by the deleted CF-CDP path).
