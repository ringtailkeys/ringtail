---
name: dev-restart
description: Restart the ringtail umbrella (tool + site) — down then up on the same UI port (10452). The umbrella scripts live in ringtail-site. Use this to pick up dependency/config changes across the whole stack. ALWAYS use the scripts, never `tilt up`/`tilt down` directly.
allowed-tools: Bash, Read
---

# Dev Restart — restart the ringtail umbrella (tool + site)

`dev_*` is the **whole-stack umbrella** (tool + site in one Tilt, UI port **10452**). Its scripts live in **ringtail-site**, so this skill `cd`s there.

**CRITICAL**: NEVER run `tilt down` / `tilt up` directly and NEVER `kill` Tilt / portless / dev-server process groups by hand. Always go through the scripts. Multiple Tilt projects share portless on `:1355` (umbrella 10452, ringtail tool 10450, ringtail site 10451, delulus 10370, builders-stack 10380) — a stray `tilt up` fights over portless routes and orphans a dashboard.

## Usage

```bash
cd ~/Development/ringtail-org/ringtail-site
./dev_down.sh && ./dev_up.sh       # same UI port 10452
```

Both scripts export the right PATH (`/opt/homebrew/bin` for portless + `~/.bun/bin` for bun), so they work from a non-interactive agent shell. `dev_up.sh` `exec`s a long-running `tilt up` — from the agent shell run the pair **in the background**.

## When to use

The clean way to pick up **dependency or Tiltfile/config changes** across the whole stack — a plain live edit won't reload them. A restart tears both the tool and the site down and brings them back on the same routes.

## Pre-flight & stray Tilts

- **`../ringtail` must exist as a sibling checkout** — the umbrella `include()`s the tool's Tiltfile by relative path; keep both repos siblings inside `ringtail-org/`.
- **portless must be up** (shared on `:1355`). If missing: `npm install -g portless`.
- `dev_down.sh` only stops the Tilt `dev_up.sh` started. An umbrella Tilt launched some other way is **untracked** and survives the down step, leaving two Tilts fighting over port 10452 — check first with `ps aux | grep "[t]ilt up"` and match `--port 10452`.
