# ringtail (the TOOL) — Tilt entrypoint. Boot with:  ./tilt_up.sh   (never
# `tilt up` directly — the script pins Tilt UI port 10450 so this dashboard
# doesn't fight delulus 10370 / builders-stack 10380 / the site's 10451, and it
# puts both portless and bun on PATH).
#
# Real logic lives in .devops/Tiltfile. Served roles get stable named URLs via
# Vercel Portless: <role>.ringtail.localhost:1355 — no pinned service ports.

load_dynamic('.devops/Tiltfile')
