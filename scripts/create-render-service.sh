#!/usr/bin/env bash
# Run after: render login
# Creates Salta Delivery API on Render (free) wired to Neon + Vercel CORS.

set -euo pipefail

REPO="${REPO:-https://github.com/fededelcura/sistema_cadeteria}"
CORS_ORIGIN="${CORS_ORIGIN:-https://sistema-cadeteria-seven.vercel.app}"
DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL to your Neon connection string}"
JWT_SECRET="${JWT_SECRET:-salta-delivery-prod-jwt-secret-2026}"

render services create \
  --name salta-delivery-api \
  --type web_service \
  --repo "$REPO" \
  --branch main \
  --runtime node \
  --root-directory api \
  --build-command "npm install --include=dev && npm run build" \
  --start-command "npm start" \
  --health-check-path /api/health \
  --plan free \
  --region oregon \
  --env-var "NODE_ENV=production" \
  --env-var "REDIS_ENABLED=false" \
  --env-var "JWT_SECRET=${JWT_SECRET}" \
  --env-var "CORS_ORIGIN=${CORS_ORIGIN}" \
  --env-var "DATABASE_URL=${DATABASE_URL}" \
  --output json
