#!/usr/bin/env bash
# Full deploy: infrastructure + API + web.
#
# For day-to-day iteration use the faster targeted scripts:
#   - scripts/deploy-api.sh   API-only via cdk hotswap (~5s)
#   - scripts/deploy-web.sh   web-only via aws s3 sync (~10s)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Building shared types"
npm run build:shared

echo "→ Building API Lambda bundle"
npm run build:api

echo "→ Building web app"
npm run build:web

echo "→ Deploying CDK stack (infra + API Lambda)"
npm run deploy -w @popcorn/infra

echo "→ Uploading web assets"
./scripts/deploy-web.sh
