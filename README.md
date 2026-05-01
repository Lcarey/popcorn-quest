# Popcorn's Chore Quest

A serverless, gamified chore tracker for kids. Built for a 10-year-old to track daily, weekly, and ad-hoc chores while feeding XP to a virtual Popcorn-the-dog companion that levels up.

## Architecture

- **Frontend** (`apps/web`): React + Vite + TypeScript + Tailwind, hosted on S3 + CloudFront
- **Backend** (`apps/api`): Single AWS Lambda (Node 20) with `hono` router, behind API Gateway HTTP API
- **DB**: DynamoDB single-table design, on-demand pricing
- **Infra** (`infra/`): AWS CDK (TypeScript) — provisions everything end-to-end
- **Shared types** (`packages/shared`): API contracts & domain types

## Quick start

Prerequisites: AWS account with credentials configured (`aws configure` or `~/.aws/credentials`), Node 20+, and CDK bootstrapped in your account/region (`npx cdk bootstrap` from `infra/`, one-time).

```bash
# Install all workspaces.
npm install

# Build shared types (other workspaces depend on it).
npm run build:shared

# One-shot build + deploy. Outputs the CloudFront app URL when done.
./scripts/deploy.sh
```

For UI-only local development, you can run `npm run dev:web` and point the
Vite proxy at a deployed API by setting `VITE_API_BASE` to your CloudFront URL.

## Cost

DynamoDB on-demand + Lambda + API Gateway + S3 + CloudFront — well within AWS free tier for one family. Post-free-tier estimate: under $1/month for typical use.

## Family setup

1. Deploy with `npm run deploy`. The output prints the CloudFront URL.
2. Open the URL on the kid's device. The setup wizard runs once: name the pet, choose a parent PIN, and the app seeds the example chores.
3. The familyId is saved in localStorage. To use the same family on a new device, copy the familyId from the parent panel ("Sync to another device") and paste it on the new device's setup screen.

## Auth model

- **Kid mode** (default): can complete tasks and add ad-hoc tasks.
- **Parent mode** (PIN-gated): can create/edit/delete recurring task templates.

PINs are bcrypt-hashed server-side.

## Layout

```
popcorn-quest/
  apps/
    web/              # Vite React app
    api/              # Lambda handler (TS, hono router)
  infra/              # AWS CDK stack
  packages/
    shared/           # shared TypeScript types
```
