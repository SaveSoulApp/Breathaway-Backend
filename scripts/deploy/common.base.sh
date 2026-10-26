#!/bin/bash

# ==============================================================================
# Base Environment Configuration: Shared Defaults & Invariants
#
# Serves as the single source of truth for non-sensitive application defaults,
# hardware specifications, and invariant constants shared across development
# and production environments.
#
# Environment-specific scripts (common.dev.sh, common.prod.sh) define their
# specific variables (e.g. PROJECT_ID, NODE_ENV, CORS_ORIGINS) and source
# this file to inherit all shared configurations without code duplication.
# ==============================================================================

# Regional & Infrastructure Invariants
export REGION="${REGION:-asia-south1}"
export REPOSITORY="${REPOSITORY:-breathaway-backend}"
export SERVICE_NAME="${SERVICE_NAME:-backend-service}"
export MAINTENANCE_SERVICE_NAME="${MAINTENANCE_SERVICE_NAME:-maintenance-service}"

# Derived Service Accounts and Artifact Registry URLs (requires PROJECT_ID)
if [[ -n "${PROJECT_ID:-}" ]]; then
    export BACKEND_SERVICE_ACCOUNT="backend-service@${PROJECT_ID}.iam.gserviceaccount.com"
    export MAINTENANCE_SERVICE_ACCOUNT="maintenance-runner@${PROJECT_ID}.iam.gserviceaccount.com"
    export IMAGE_BASE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"
    export GCP_PROJECT_ID="${PROJECT_ID}"
    export DSAR_EXPORT_BUCKET_NAME="${PROJECT_ID}-dsar-exports"
fi

# Application & Logging Defaults
export APP_NAME="${APP_NAME:-BreathAway}"
export DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-gcp}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export SHOULD_LOG_RESPONSE="${SHOULD_LOG_RESPONSE:-false}"
export IS_THROTTLING_ENABLED_VIA_REDIS="${IS_THROTTLING_ENABLED_VIA_REDIS:-false}"
export REQUIRED_PLATFORMS="${REQUIRED_PLATFORMS:-'["ios","android","web","postman"]'}"
export MIN_APP_VERSION="${MIN_APP_VERSION:-1.0.0}"
export GCP_BUCKET_NAME="${GCP_BUCKET_NAME:-breathaway-documents}"
export META_VERIFY_TOKEN="${META_VERIFY_TOKEN:-my_meta_verification_token}"

# Firebase Admin SDK Configuration
export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-${PROJECT_ID:-breathaway-development}}"

# JWT & Authentication Defaults
export JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-15m}"
export JWT_REFRESH_EXPIRES_IN="${JWT_REFRESH_EXPIRES_IN:-14d}"
export JWT_AUDIENCE="${JWT_AUDIENCE:-breathaway-mobile-app}"
export OTP_TTL="${OTP_TTL:-300}"
export OTP_RATE_LIMIT_TTL="${OTP_RATE_LIMIT_TTL:-120}"

# Mail Provider Configuration
export EMAIL_FROM_ADDRESS="${EMAIL_FROM_ADDRESS:-no-reply@breathaway.app}"
export EMAIL_FROM_NAME="${EMAIL_FROM_NAME:-Breathaway}"
export EMAIL_PROVIDER="${EMAIL_PROVIDER:-brevo}"
export MAILGUN_API_KEY="${MAILGUN_API_KEY:-some-api-key}"
export MAILGUN_DOMAIN="${MAILGUN_DOMAIN:-domain@domaincom}"
export SENDGRID_API_KEY="${SENDGRID_API_KEY:-SG.some-api-key}"

# WhatsApp Provider Configuration
export WHATSAPP_PROVIDER="${WHATSAPP_PROVIDER:-liteapp}"
export LITEAPP_WHATSAPP_URL="${LITEAPP_WHATSAPP_URL:-https://www.liteapp.store}"

# Cloud Pub/Sub & Business Policy Limits
export AUDIT_PUBSUB_TOPIC="${AUDIT_PUBSUB_TOPIC:-audit-logs-topic}"
export CREDIT_EXPIRY_DAYS="${CREDIT_EXPIRY_DAYS:-90}"
export LIKE_EXPIRY_DAYS="${LIKE_EXPIRY_DAYS:-90}"

# Cloud Run Resources (Public API)
export CPU="${CPU:-2}"
export MEMORY="${MEMORY:-2Gi}"
export CONCURRENCY="${CONCURRENCY:-160}"

# Cloud Run Resources (Internal Maintenance Service)
export MAINTENANCE_CPU="${MAINTENANCE_CPU:-2}"
export MAINTENANCE_MEMORY="${MAINTENANCE_MEMORY:-2Gi}"
export MAINTENANCE_MAX_INSTANCES="${MAINTENANCE_MAX_INSTANCES:-5}"
export MAINTENANCE_CONCURRENCY="${MAINTENANCE_CONCURRENCY:-80}"

# Database Connection Pool Sizing & Timeouts
export DB_POOL_MAX="${DB_POOL_MAX:-4}"
export DB_POOL_MIN="${DB_POOL_MIN:-0}"
export DB_POOL_ACQUISITION_TIMEOUT_MS="${DB_POOL_ACQUISITION_TIMEOUT_MS:-5000}"
export DB_POOL_IDLE_TIMEOUT_MS="${DB_POOL_IDLE_TIMEOUT_MS:-10000}"
export DB_POOL_STATEMENT_TIMEOUT_MS="${DB_POOL_STATEMENT_TIMEOUT_MS:-15000}"

# Geographic & Enrichment Defaults
export DEFAULT_COUNTRY_CODE="${DEFAULT_COUNTRY_CODE:-IN}"
export IPINFO_TIMEOUT_MS="${IPINFO_TIMEOUT_MS:-1500}"
