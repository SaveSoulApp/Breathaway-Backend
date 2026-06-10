#!/bin/bash

# ==============================================================================
# Environment Configuration: Development
# ==============================================================================

export PROJECT_ID="breathaway-dev"
export REGION="asia-south1"
export REPOSITORY="breathaway-backend"
export SERVICE_NAME="backend-service"

# Define the base URL for Artifact Registry (Without the tag)
# The deploy.sh script will dynamically append :${GIT_COMMIT_HASH} to this.
export IMAGE_BASE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"

# ==============================================================================
# Non-Sensitive Application Configuration
# ==============================================================================
export NODE_ENV='development'
export LOG_LEVEL='info'
export SHOULD_LOG_RESPONSE='false'
export DEPLOYMENT_ENV='gcp'

export APP_NAME="BreathAway"
export REQUIRED_PLATFORMS='["iOS","Android","Postman"]'
export MIN_APP_VERSION="1.0.0"

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

export EMAIL_FROM_ADDRESS='no-reply@breathaway.com'
export EMAIL_FROM_NAME='BreathAway'

export GCP_OIDC_AUDIENCE='https://backend-service-at7g3x4m6q-el.a.run.app'

# Mail provider
export EMAIL_PROVIDER='mailgun'

export MAILGUN_API_KEY='some-api-key'
export MAILGUN_DOMAIN='domain@domaincom'
export SENDGRID_API_KEY='SG.some-api-key'
export BREVO_API_KEY='your_brevo_api_key_here'

# Swagger UI Access Control
# Set to 'false' to completely disable Swagger UI on this environment
export SWAGGER_ENABLED='true'

export AUDIT_PUBSUB_TOPIC='audit-logs-topic'