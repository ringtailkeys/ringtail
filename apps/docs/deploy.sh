#!/usr/bin/env bash
# Deploy @ringtail/docs to Cloudflare Pages → docs.ringtailkeys.com
#
# Mirrors the ringtail-site cockpit deploy pattern: source the token from env,
# build the static export, `wrangler pages deploy`, then smoke-test the live URL.
# No `wrangler login` — auth is entirely via CLOUDFLARE_API_TOKEN in the env.
#
#   Usage:  ./deploy.sh
#   Env:    CLOUDFLARE_API_TOKEN   (required — Pages:Edit scoped token)
#           CLOUDFLARE_ACCOUNT_ID  (required)
#   Both are read from repo-root .env.local if present (names match .env.example).
set -euo pipefail

DOCS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DOCS_DIR/../.." && pwd)"
PROJECT="ringtail-docs"
OUT_DIR="out"
SMOKE_URL="${DOCS_SMOKE_URL:-https://docs.ringtailkeys.com/docs}"

# 1. Source the Cloudflare token/account from repo-root .env.local (names only there).
if [[ -f "$REPO_ROOT/.env.local" ]]; then
  set -a; source "$REPO_ROOT/.env.local"; set +a
fi
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (Pages:Edit scoped token)}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

# 2. Build the static export → apps/docs/out (fumadocs-mdx codegen + next build).
cd "$DOCS_DIR"
echo "▶ building static export…"
bun run build

if [[ ! -d "$OUT_DIR" ]]; then
  echo "✗ expected static export at $DOCS_DIR/$OUT_DIR — did next build run with output: export?" >&2
  exit 1
fi

# 3. Deploy the exported dir. `wrangler pages deploy` reads the token from env.
#    (bunx pins wrangler without adding it to the repo's deps.)
echo "▶ deploying $OUT_DIR → Cloudflare Pages project '$PROJECT'…"
bunx wrangler@latest pages deploy "$OUT_DIR" --project-name "$PROJECT"

# 4. Smoke-test: the live docs route must return 200.
echo "▶ smoke-testing $SMOKE_URL…"
code="$(curl -s -o /dev/null -w '%{http_code}' -L "$SMOKE_URL" || true)"
if [[ "$code" == "200" ]]; then
  echo "✓ $SMOKE_URL → $code"
else
  echo "✗ $SMOKE_URL → $code (deploy uploaded, but the URL isn't healthy — check DNS/custom-domain binding)" >&2
  exit 1
fi
