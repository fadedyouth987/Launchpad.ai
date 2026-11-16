#!/usr/bin/env bash
# ALTERNATIVE to Neon Functions (npm run deploy:api). Deploys the API (Express, API-only) to Google Cloud Run from source using the Dockerfile.
# Prerequisites and one-time setup: see HOW_TO_RUN.md "Alternative: API on Google Cloud Run (Docker)".
#
#   PROJECT_ID=saas-k7ywdn REGION=asia-southeast1 \
#   ALLOWED_ORIGINS=https://launchpad-web.<subdomain>.workers.dev \
#   ./scripts/deploy-cloudrun.sh
#
# Data and auth live in Neon: DATABASE_URL (pooled) comes from Secret Manager; the Neon Auth URLs are
# public and read from the environment or .env.local (written by `neon deploy`). Migrations run first
# from this machine against DATABASE_URL_UNPOOLED in .env.local (SKIP_MIGRATE=1 to skip).
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID (the Google Cloud project)}"
: "${ALLOWED_ORIGINS:?set ALLOWED_ORIGINS to the web app origin(s), comma-separated}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-launchpad-api}"
RUNTIME_SA="${RUNTIME_SA:-launchpad-api@${PROJECT_ID}.iam.gserviceaccount.com}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"
# Secret Manager secret holding the Gemini key; set GEMINI_SECRET= (empty) to deploy without AI.
GEMINI_SECRET="${GEMINI_SECRET-launchpad-gemini-api-key}"
# Secret Manager secret holding the POOLED Neon DATABASE_URL (see HOW_TO_RUN.md).
DATABASE_SECRET="${DATABASE_SECRET:-launchpad-database-url}"
SECRETS="DATABASE_URL=${DATABASE_SECRET}:latest"
if [[ -n "$GEMINI_SECRET" ]]; then SECRETS="${SECRETS},GEMINI_API_KEY=${GEMINI_SECRET}:latest"; fi
# rate limits are per instance unless a Redis store is configured

# Public Neon Auth URLs: from the environment, else from .env.local.
from_env_file() { [[ -f .env.local ]] && sed -n "s/^$1=//p" .env.local | tr -d '"' | tail -1; }
NEON_AUTH_BASE_URL="${NEON_AUTH_BASE_URL:-$(from_env_file NEON_AUTH_BASE_URL)}"
NEON_AUTH_JWKS_URL="${NEON_AUTH_JWKS_URL:-$(from_env_file NEON_AUTH_JWKS_URL)}"
: "${NEON_AUTH_BASE_URL:?set NEON_AUTH_BASE_URL (run neon deploy / neon env pull)}"
: "${NEON_AUTH_JWKS_URL:?set NEON_AUTH_JWKS_URL (run neon deploy / neon env pull)}"

if [[ "${SKIP_MIGRATE:-}" != "1" ]]; then
  echo "Running database migrations (DATABASE_URL_UNPOOLED from .env.local)…"
  npm run --silent db:migrate
fi

# Comma-separated values must use a custom delimiter for --set-env-vars.
ENV_VARS="^@^NODE_ENV=production@SERVE_STATIC=false@ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"
ENV_VARS="${ENV_VARS}@NEON_AUTH_BASE_URL=${NEON_AUTH_BASE_URL}@NEON_AUTH_JWKS_URL=${NEON_AUTH_JWKS_URL}"
for v in AI_GENERATION_COST_CREDITS AI_ASSIST_COST_CREDITS NEW_WORKSPACE_CREDITS MAX_WORKSPACES_PER_USER \
  AI_RATE_LIMIT_PER_MINUTE GEMINI_MODEL WEBHOOK_DELIVERY_ENABLED DATABASE_POOL_MAX; do
  if [[ -n "${!v:-}" ]]; then ENV_VARS="${ENV_VARS}@${v}=${!v}"; fi
done

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances "$MAX_INSTANCES" \
  --timeout 120 \
  --set-env-vars "$ENV_VARS" \
  --set-secrets "$SECRETS"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"
echo "API deployed: $URL"
echo "Check: curl $URL/api/health && curl $URL/api/ready"
echo "Next: rebuild the web app with VITE_API_BASE_URL=$URL (VITE_NEON_AUTH_URL comes from .env.local) and run npm run deploy:web"
