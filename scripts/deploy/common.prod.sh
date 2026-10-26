#!/bin/bash

# ==============================================================================
# Environment Configuration: Production
# ==============================================================================

export PROJECT_ID="breathaway"
export NODE_ENV='production'

# Allowed Origins & Auth Issuers
export CORS_ORIGINS='["https://breathaway.app","https://www.breathaway.app"]'
export JWT_ISSUER='https://breathaway.app'

# Google Cloud OIDC Audience (Internal Services)
export GCP_OIDC_AUDIENCE='https://backend-service-at7g3x4m6q-el.a.run.app'

# Swagger UI Access Control (Disabled for prod)
export SWAGGER_ENABLED='false'

# Cloud Run Scaling Limits
export MAX_INSTANCES='20'

# Supabase Realtime JWT Key ID for production
export SUPABASE_JWT_KEY_ID='07a5a024-3d60-4f91-a3e3-39645975dac1'

# Supported client platforms (Production strictly excludes Postman)
export REQUIRED_PLATFORMS='["ios","android","web"]'

# Source shared base configurations and derived variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "${SCRIPT_DIR}/common.base.sh"
