#!/usr/bin/env bash
# Fast API-only deploy via cdk hotswap.
# Drops Lambda code straight onto the function via UpdateFunctionCode (no
# CloudFormation changeset). Typical time: 3-5 seconds.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Building shared types"
npm run build:shared --silent
echo "→ Building API Lambda bundle"
npm run build:api --silent

echo "→ Hotswap deploy (Lambda code only — no CloudFormation)"
npm run hotswap -w @popcorn/infra
