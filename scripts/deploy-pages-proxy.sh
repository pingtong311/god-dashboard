#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node_modules/.bin/wrangler pages deploy ./cloudflare-pages-proxy \
  --project-name skynet-dashboard-cf \
  --branch main
