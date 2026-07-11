---
name: tilt-restart
description: Restart the ringtail (tool) Tilt dev environment — down then up on the same UI port (10450). Use this to pick up dependency or Tiltfile/config changes cleanly. ALWAYS use the scripts, never `tilt down`/`tilt up` directly.
allowed-tools: Bash, Read
---

# Tilt Restart — restart the ringtail (tool) dev environment

**CRITICAL**: NEVER run `tilt down` / `tilt up` directly and NEVER `kill` Tilt / portless / dev-server process groups by hand. Always go through the scripts. Multiple Tilt projects share portless on `:1355` (ringtail tool **10450**, ringtail site 10451, umbrella 10452, delulus 10370, builders-stack 10380) — a stray `tilt up` fights over portless routes and orphans a dashboard.

## Usage

```bash
cd ~/Development/ringtail-org/ringtail
./tilt_down.sh && ./tilt_up.sh     # same UI port 10450
```

Both scripts already export the right PATH (`/opt/homebrew/bin` for portless + `~/.bun/bin` for bun), so they work from a non-interactive agent shell. `tilt_up.sh` `exec`s `tilt up` (a long-running foreground process) — from the agent shell run the pair **in the background**.

## When to use

The clean way to pick up **dependency or Tiltfile/config changes** — a plain live edit won't reload them. A restart tears the daemon/dashboard/storybook down and brings them back on the same routes.

## Note on stray Tilts

`tilt_down.sh` only stops the Tilt it started. A ringtail tool Tilt launched some other way (a manual `tilt up`, an old session) is **untracked** and survives the down step — so the restart can leave two Tilts fighting over port 10450. Check first with `ps aux | grep "[t]ilt up"` and match `--port 10450`.

- ringtail (tool) has **no database** — no `db:push`, so none of the shared-DB startup hangs that bite the delulus projects apply here.
