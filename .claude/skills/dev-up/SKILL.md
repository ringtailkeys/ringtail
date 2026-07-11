---
name: dev-up
description: Start the ringtail umbrella (tool + site) — one Tilt that boots BOTH repos together on UI port 10452. The umbrella scripts live in ringtail-site. ALWAYS use ./dev_up.sh, never `tilt up` directly.
allowed-tools: Bash, Read
---

# Dev Up — start the ringtail umbrella (tool + site)

`dev_*` is the **whole-stack umbrella**: one Tilt that serves the tool (daemon + dashboard + cli) *and* the site (landing) together. The umbrella scripts live in **ringtail-site** (`dev.Tiltfile` `include()`s the tool's Tiltfile via the sibling path `../ringtail`), so this skill `cd`s there.

**CRITICAL**: NEVER run `tilt up` directly and NEVER `kill` Tilt / portless by hand. Always use `./dev_up.sh`. Multiple Tilt projects share portless on `:1355` (umbrella **10452**, ringtail tool 10450, ringtail site 10451, delulus 10370, builders-stack 10380) — a stray `tilt up` fights over portless routes and orphans a dashboard.

## Usage

```bash
cd ~/Development/ringtail-org/ringtail-site
./dev_up.sh            # Tilt UI on http://localhost:10452
```

The script exports the right PATH (`/opt/homebrew/bin` for portless + `~/.bun/bin` for bun), so it works from a non-interactive agent shell. It `exec`s a long-running `tilt up` — from the agent shell run it **in the background**.

## Services (all via portless, no pinned ports)

| Resource | URL | What |
|---|---|---|
| dashboard | http://dashboard.ringtail.localhost:1355 | tool — the cockpit |
| daemon | http://api.ringtail.localhost:1355 | tool — `/health`, `/api/status`, MCP + SSE |
| landing | http://landing.ringtail.localhost:1355 | site — brand landing |

Tilt UI: http://localhost:10452

## Pre-flight

- **`../ringtail` must exist as a sibling checkout** — the umbrella `include()`s the tool's Tiltfile by relative path; the two repos MUST stay siblings inside `ringtail-org/`.
- **portless must be up** (shared on `:1355` across all projects — `portless --version` should print). If missing: `npm install -g portless`.
- **Check for a stray umbrella Tilt first**: `ps aux | grep "[t]ilt up"` matching `--port 10452`; don't start a second.

## Teardown

`./dev_down.sh` (in ringtail-site) — stops the umbrella, which covers both the tool and the site. (See the `dev-down` skill.)
