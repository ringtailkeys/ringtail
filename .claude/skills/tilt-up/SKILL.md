---
name: tilt-up
description: Start the ringtail (tool) local dev environment with Tilt + portless. Use this to run the daemon, dashboard, and Storybook on stable *.ringtail.localhost:1355 URLs. ALWAYS use this instead of running `tilt up` directly.
allowed-tools: Bash, Read
---

# Tilt Up — start the ringtail (tool) dev environment

**CRITICAL**: NEVER run `tilt up` directly. Always use `./tilt_up.sh`. Multiple Tilt projects run in parallel on different UI ports (ringtail tool **10450**, ringtail site 10451, delulus 10370, builders-stack 10380, others on 10400/10401…) — a stray `tilt up` fights over portless routes and orphans a dashboard.

## Usage

```bash
cd ~/Development/ringtail-org/ringtail
./tilt_up.sh            # Tilt UI on http://localhost:10450
```

The script already exports the right PATH (`/opt/homebrew/bin` for portless + `~/.bun/bin` for bun), so it works from a non-interactive agent shell too. From the agent shell, run it **in the background** (it `exec`s `tilt up`, a long-running foreground process).

## Services (all via portless, no pinned ports)

| Resource | URL | What |
|---|---|---|
| dashboard | http://dashboard.ringtail.localhost:1355 | the cockpit (Vite SPA, live-driven by the daemon) |
| storybook | http://storybook.ringtail.localhost:1355 | design system + every cockpit flow (`storybook dev`, live — never a static build) |
| daemon | http://api.ringtail.localhost:1355 | Hono: `/health`, `/api/status`, the MCP surface + SSE |
| cli | — | built/watched (`packages/cli` → `dist/cli.js`), not served |
| tunnel · build-prod | (manual buttons in the Tilt UI) | cloudflared preview · prod dashboard build |

Tilt UI: http://localhost:10450

## Pre-flight

- **portless must be up** (it's shared on `:1355` across all projects — `portless --version` should print, e.g. 0.7.1). If missing: `npm install -g portless`.
- **Check for a stray ringtail Tilt first**: `curl -sf http://localhost:10450 >/dev/null && echo "already up"`. If already up, don't start another — just use the URLs.
- ringtail has **no database** — no `db:push`, so none of the shared-DB startup hangs that bite the delulus projects apply here.

## Checking status

```bash
tilt --port 10450 get uiresources        # resource health
portless list                            # active routes
curl -sf http://api.ringtail.localhost:1355/health   # daemon up?
```

## Teardown

`./tilt_down.sh` — kills only ringtail's tracked Tilt, never portless or other projects' Tilts. (See the `tilt-down` skill.)
