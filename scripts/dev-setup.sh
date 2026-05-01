#!/usr/bin/env bash
# Set up local development:
#   1. Start dynamodb-local in Docker
#   2. Create the PopcornQuest table
#   3. Print env vars to put in apps/api .env
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null; then
  echo "Docker is required. Install Docker Desktop first."
  exit 1
fi

echo "→ Starting dynamodb-local container"
docker compose up -d dynamodb

echo "→ Waiting for dynamodb-local to be ready"
for i in $(seq 1 20); do
  if curl -s http://localhost:8000 >/dev/null; then break; fi
  sleep 0.5
done

echo "→ Creating PopcornQuest table"
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local aws dynamodb create-table \
  --endpoint-url http://localhost:8000 \
  --region us-east-1 \
  --table-name PopcornQuest \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --no-cli-pager \
  >/dev/null 2>&1 && echo "  Table created." || echo "  Table already exists."

cat <<EOF

Local DynamoDB is running on http://localhost:8000

Run the API in offline mode:
  cd apps/api
  DDB_LOCAL=1 npm run dev

In another terminal, run the web app (Vite proxies /api to localhost:8787):
  npm run dev:web

Stop dynamodb-local with:
  docker compose down
EOF
