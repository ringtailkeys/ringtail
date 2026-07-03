#!/usr/bin/env bash
# Stop the ringtail TOOL Tilt session. Served roles die with Tilt, which auto-
# cleans their portless routes. The shared portless proxy (port 1355) keeps
# running for other projects — stop it manually with `portless proxy stop`.
set -euo pipefail
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH"
TILT_PORT="${TILT_PORT:-10450}"

tilt down --port "$TILT_PORT" 2>/dev/null || tilt down 2>/dev/null || true
echo "→ ringtail (tool): stopped"
