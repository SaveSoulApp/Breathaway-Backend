#!/bin/bash

# ==============================================================================
# Environment Configuration: Development
# ==============================================================================

export PROJECT_ID="breathaway-development"
export NODE_ENV='development'

# Allowed Origins & Auth Issuers
export CORS_ORIGINS='["http://localhost:3000","http://localhost:5173","https://dev.breathaway.app"]'
export JWT_ISSUER='https://dev.breathaway.app'

# Google Cloud OIDC Audience (Internal Services)
export GCP_OIDC_AUDIENCE='https://backend-service-54c574542a-el.a.run.app,https://maintenance-service-54c574542a-el.a.run.app'

# Swagger UI Access Control (Enabled for dev)
export SWAGGER_ENABLED='true'

# Cloud Run Scaling Limits
export MAX_INSTANCES='10'

# Supabase Realtime JWT Key ID for development
export SUPABASE_JWT_KEY_ID='07a5a024-3d60-4f91-a3e3-39645975dac1'

# Supported client platforms (Development includes Postman for testing)
export REQUIRED_PLATFORMS='["ios","android","web","postman"]'

# WhatsApp Like Notification Configuration
export WHATSAPP_LIKE_NOTIFICATION_ENABLED='false'
export WHATSAPP_LIKE_NOTIFICATION_BUFFER_DAYS='7'
export WHATSAPP_LIKE_ALLOWED_COUNTRY_CODES='["+91"]'

# Source shared base configurations and derived variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "${SCRIPT_DIR}/common.base.sh"
