---
name: tilt-down
description: Stop the ringtail (tool) Tilt dev environment cleanly. Use this instead of killing tilt/portless processes by hand.
allowed-tools: Bash, Read
---

# Tilt Down — stop the ringtail (tool) dev environment

**CRITICAL**: NEVER `kill` Tilt / portless / dev-server process groups by hand, and never run `tilt down` directly. Use `./tilt_down.sh`.

## Usage

```bash
cd ~/Development/ringtail-org/ringtail
./tilt_down.sh
```

## What it does

- Stops **only** ringtail's tracked Tilt (its own UI on port 10450 / its `.tilt.pid`), leaving other projects' Tilts (10370/10380/10400/10401/…) untouched.
- **Never** stops portless — it's the shared `:1355` proxy used by every project.

## Note on stray Tilts

`tilt_down.sh` only knows about the Tilt it started. A ringtail Tilt launched some other way (a manual `tilt up`, an old session) is untracked and survives this — check with `ps aux | grep "[t]ilt up"` and match `--port 10450` before assuming a clean slate.
