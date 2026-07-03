#!/usr/bin/env bash
# ALWAYS boot the ringtail TOOL with this, never `tilt up` directly.
# Pins a per-project Tilt UI port (10450) so it runs alongside delulus (10370),
# builders-stack (10380) and the ringtail SITE (10451) without fighting over a
# dashboard. Also ensures portless (Homebrew) and bun (~/.bun/bin) are on PATH —
# the Tiltfile depends on both.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${TILT_PORT:-10450}"

# portless lives in Homebrew bin; bun in ~/.bun/bin. Neither is guaranteed on a
# non-interactive PATH.
export PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH"

if ! command -v portless >/dev/null 2>&1; then
  echo "portless not found — needed for stable *.ringtail.localhost:1355 URLs." >&2
  echo "  install it:  npm install -g portless" >&2
  exit 1
fi

echo "→ ringtail (tool): tilt up on http://localhost:$PORT"
echo "  Dashboard http://dashboard.ringtail.localhost:1355 · Daemon http://api.ringtail.localhost:1355"
exec tilt up --port "$PORT" "$@"
