#!/usr/bin/env bash
# Fast web-only deploy.
# - Builds the React app (~3s)
# - Syncs to S3 with two cache profiles: long for /assets/, no-cache for the rest
# - Invalidates only index.html, manifest, SW (the un-hashed entry points)
# Total time: ~5-10s, vs. ~60s for a full CDK deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

STACK_NAME=${STACK_NAME:-PopcornQuestStack}
REGION=${AWS_REGION:-us-east-1}

echo "→ Building shared types"
npm run build:shared --silent

echo "→ Building web app"
npm run build:web --silent

echo "→ Looking up bucket + distribution from stack outputs"
BUCKET=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
DIST_ID=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

if [[ -z "$BUCKET" || -z "$DIST_ID" ]]; then
  echo "Error: Couldn't find bucket/distribution. Have you run a full deploy yet?"
  exit 1
fi

echo "→ Uploading immutable hashed assets (long cache)"
aws s3 sync apps/web/dist/assets/ "s3://$BUCKET/assets/" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete \
  --only-show-errors

echo "→ Uploading photo-mood images (1d cache)"
if [[ -d apps/web/dist/popcorn-moods ]]; then
  aws s3 sync apps/web/dist/popcorn-moods/ "s3://$BUCKET/popcorn-moods/" \
    --cache-control "public, max-age=86400" \
    --only-show-errors
fi

echo "→ Uploading entry-point files (no-cache; CloudFront also enforces this)"
# index.html, manifest.webmanifest, registerSW.js, sw.js, workbox-*.js, icons
aws s3 sync apps/web/dist/ "s3://$BUCKET/" \
  --cache-control "public, max-age=0, must-revalidate" \
  --exclude "assets/*" \
  --exclude "popcorn-moods/*" \
  --delete \
  --only-show-errors

echo "→ Invalidating un-hashed entry points (small, ~30s instead of full /*)"
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/index.html" "/manifest.webmanifest" "/sw.js" "/registerSW.js" "/workbox-*" \
  --query 'Invalidation.Id' --output text \
  >/dev/null

echo ""
APP_URL=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text)
echo "Done. Live in <30s at $APP_URL"
