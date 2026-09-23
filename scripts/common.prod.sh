#!/bin/bash

# ==============================================================================
# Environment Configuration: Production
# ==============================================================================

export PROJECT_ID="breathaway"
export REGION="asia-south1"
export REPOSITORY="breathaway-backend"
export SERVICE_NAME="backend-service"

# Define the base URL for Artifact Registry (Without the tag)
# The deploy.sh script will dynamically append :${GIT_COMMIT_HASH} to this.
export IMAGE_BASE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"

# ==============================================================================
# Non-Sensitive Application Configuration
# ==============================================================================
export NODE_ENV='production'
export LOG_LEVEL='info'
export SHOULD_LOG_RESPONSE='false'
export DEPLOYMENT_ENV='gcp'

export APP_NAME="BreathAway"
export REQUIRED_PLATFORMS='["iOS","Android","Web","Postman"]'
export MIN_APP_VERSION="1.0.0"
export CORS_ORIGINS='["https://breathaway.com","https://www.breathaway.com"]'

export GCP_PROJECT_ID="${PROJECT_ID}"
export GCP_BUCKET_NAME='breathaway-documents'

export META_VERIFY_TOKEN='my_meta_verification_token'

# Firebase Admin SDK Configuration
export FIREBASE_PROJECT_ID='breathaway-dev-37fd5'

# JWT
export JWT_EXPIRES_IN='30d'
export JWT_AUDIENCE='breathaway-mobile-app'
export JWT_ISSUER='https://breathaway.app'

export OTP_TTL='300'
export OTP_RATE_LIMIT_TTL='120'

export EMAIL_FROM_ADDRESS='no-reply@breathaway.app'
export EMAIL_FROM_NAME='BreathAway'

export GCP_OIDC_AUDIENCE='https://backend-service-at7g3x4m6q-el.a.run.app'

# Mail provider
export EMAIL_PROVIDER='brevo'

export MAILGUN_API_KEY='some-api-key'
export MAILGUN_DOMAIN='domain@domaincom'
export SENDGRID_API_KEY='SG.some-api-key'

# Swagger UI Access Control
# Set to 'false' to completely disable Swagger UI on this environment
export SWAGGER_ENABLED='false'

export AUDIT_PUBSUB_TOPIC='audit-logs-topic'

export CREDIT_EXPIRY_DAYS='90'
export LIKE_EXPIRY_DAYS='90'

# Cloud Run Autoscaling & Concurrency Limits
export MAX_INSTANCES='20'
export CONCURRENCY='160'

# Database Connection Pool Sizing & Timeouts
export DB_POOL_MAX='4'
export DB_POOL_MIN='0'
export DB_POOL_ACQUISITION_TIMEOUT_MS='5000'
export DB_POOL_IDLE_TIMEOUT_MS='10000'
export DB_POOL_STATEMENT_TIMEOUT_MS='15000'

export DEFAULT_COUNTRY_CODE='IN'

export IPINFO_TIMEOUT_MS='1500'

# Supabase Realtime JWT Key ID (matching the public key registered in Supabase JWT Signing Keys)
export SUPABASE_JWT_KEY_ID='709ac6ba-a048-4f39-a6ce-c1f9c993b98b'