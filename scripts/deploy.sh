#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
ENV="dev"
FORCE_BUILD="false"

# Helper logging functions
print_status() { echo -e "\033[0;34m🔨 $1\033[0m"; }
print_success() { echo -e "\033[0;32m✅ $1\033[0m"; }
print_error() { echo -e "\033[0;31m❌ $1\033[0m"; exit 1; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --env=*)
            ENV="${1#*=}"
            shift
            ;;
        --env|-e)
            if [[ -z "${2:-}" ]]; then
                print_error "Missing value for $1 flag"
            fi
            ENV="$2"
            shift 2
            ;;
        --force)
            FORCE_BUILD="true"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --env=<dev|prod>, -e <dev|prod>   Target deployment environment (default: dev)"
            echo "  --force                           Force Docker image rebuild even if tag exists"
            echo "  --help, -h                        Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown argument '$1'. Run '$0 --help' for usage."
            ;;
    esac
done

# Validate environment
if [[ "${ENV}" != "dev" && "${ENV}" != "prod" ]]; then
    print_error "Invalid environment '${ENV}'. Allowed values are 'dev' or 'prod'."
fi

# Locate and source environment configuration
ENV_CONFIG_FILE="${SCRIPT_DIR}/common.${ENV}.sh"
if [[ ! -f "${ENV_CONFIG_FILE}" ]]; then
    print_error "Environment configuration not found at ${ENV_CONFIG_FILE}"
fi

print_status "Loading environment configuration: [${ENV}] (${ENV_CONFIG_FILE})"
source "${ENV_CONFIG_FILE}"

# Validate required variables
: "${PROJECT_ID:?Variable PROJECT_ID is not set}"
: "${IMAGE_BASE_URL:?Variable IMAGE_BASE_URL is not set}"
: "${SERVICE_NAME:?Variable SERVICE_NAME is not set}"
: "${REGION:?Variable REGION is not set}"

# Bind image tag to Git Commit Hash
GIT_COMMIT=$(git rev-parse --short HEAD)
IMAGE_TAG_WITH_COMMIT="${IMAGE_BASE_URL}:${GIT_COMMIT}"

build_image() {
    print_status "Checking Artifact Registry for existing image: ${IMAGE_TAG_WITH_COMMIT}"
    
    if [[ "${FORCE_BUILD}" == "false" ]]; then
        if gcloud artifacts docker images describe "${IMAGE_TAG_WITH_COMMIT}" --project="${PROJECT_ID}" --quiet >/dev/null 2>&1; then
            print_success "Image already exists! Skipping build phase."
            return 0
        fi
    else
        print_status "Force flag provided! Rebuilding image even if it exists."
    fi

    print_status "Building new Docker image..."
    
    local gcloud_build_args=(
        builds submit
        --tag "${IMAGE_TAG_WITH_COMMIT}"
        --project "${PROJECT_ID}"
        --machine-type=e2-highcpu-8
        --timeout=900s
    )

    gcloud "${gcloud_build_args[@]}" || print_error "Docker build failed"
    print_success "Build completed successfully"
}

deploy_service() {
    print_status "Deploying to Cloud Run: ${SERVICE_NAME} (${REGION})"

    local secrets=(
        "CLIENT_IDS=client-ids:latest"
        "API_KEYS=api-keys:latest"
        "JWT_SECRET=jwt-secret:latest"
        "INSTAGRAM_ACCESS_TOKEN=access-token-instagram:latest"
        "DATABASE_URL=database-url:latest"
        "REDIS_URL=redis-url:latest"
        "GCP_SECRET_MASTER_KEYS=gcp-secret-master-keys:latest"
        "ACTIVE_MASTER_KEY_ID=active-master-key-id:latest"
        "HMAC_KEY_BASE64=hmac-key-base64:latest"
        "FIREBASE_CLIENT_EMAIL=firebase-client-email:latest"
        "FIREBASE_PRIVATE_KEY=firebase-private-key:latest"
        "PUBSUB_VERIFICATION_TOKEN=pubsub-verification-token:latest"
        "KMS_KEY_NAMES=kms-key-names:latest"
        "KMS_ACTIVE_KEY_ID=kms-active-key-id:latest"
        "SUPABASE_URL=supabase-url:latest"
        "SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest"
        "SUPABASE_JWT_PRIVATE_KEY=supabase-jwt-private-key:latest"
        "ADMIN_USERNAME=admin-username:latest"
        "ADMIN_PASSWORD=admin-password:latest"
        "SWAGGER_USERNAME=swagger-username:latest"
        "SWAGGER_PASSWORD=swagger-password:latest"
        "REVENUECAT_WEBHOOK_SECRET=revenuecat-webhook-secret:latest"
    )

    local gcloud_run_args=(
        run deploy "${SERVICE_NAME}"
        --image="${IMAGE_TAG_WITH_COMMIT}"
        --region="${REGION}"
        --memory=2Gi
        --cpu=2
        --allow-unauthenticated # Remove if this is a private microservice
        --quiet
    )

    # Prepare environment variables
    local env_vars=(
        "NODE_ENV=${NODE_ENV}"
        "LOG_LEVEL=${LOG_LEVEL}"
        "SHOULD_LOG_RESPONSE=${SHOULD_LOG_RESPONSE}"
        "DEPLOYMENT_ENV=${DEPLOYMENT_ENV}"
        "APP_NAME=${APP_NAME}"
        "REQUIRED_PLATFORMS=${REQUIRED_PLATFORMS}"
        "MIN_APP_VERSION=${MIN_APP_VERSION}"
        "GCP_PROJECT_ID=${GCP_PROJECT_ID}"
        "GCP_BUCKET_NAME=${GCP_BUCKET_NAME}"
        "META_VERIFY_TOKEN=${META_VERIFY_TOKEN}"
        "FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}"
        "JWT_EXPIRES_IN=${JWT_EXPIRES_IN}"
        "JWT_AUDIENCE=${JWT_AUDIENCE}"
        "JWT_ISSUER=${JWT_ISSUER}"
        "OTP_TTL=${OTP_TTL}"
        "EMAIL_FROM_ADDRESS=${EMAIL_FROM_ADDRESS}"
        "EMAIL_FROM_NAME=${EMAIL_FROM_NAME}"
        "EMAIL_PROVIDER=${EMAIL_PROVIDER}"
        "MAILGUN_API_KEY=${MAILGUN_API_KEY}"
        "MAILGUN_DOMAIN=${MAILGUN_DOMAIN}"
        "SENDGRID_API_KEY=${SENDGRID_API_KEY}"
        "BREVO_API_KEY=${BREVO_API_KEY}"
        "SWAGGER_ENABLED=${SWAGGER_ENABLED}"
        "GCP_OIDC_AUDIENCE=${GCP_OIDC_AUDIENCE}"
        "AUDIT_PUBSUB_TOPIC=${AUDIT_PUBSUB_TOPIC}"
        "CREDIT_EXPIRY_DAYS=${CREDIT_EXPIRY_DAYS}"
        "LIKE_EXPIRY_DAYS=${LIKE_EXPIRY_DAYS}"
    )

    # Join environment variables with ~ delimiter to handle commas safely (e.g. REQUIRED_PLATFORMS)
    local env_vars_str="^~^"
    for ev in "${env_vars[@]}"; do
        env_vars_str="${env_vars_str}${ev}~"
    done
    env_vars_str="${env_vars_str%~}" # Remove trailing ~
    
    gcloud_run_args+=(--set-env-vars="${env_vars_str}")

    # Attach secrets
    for secret in "${secrets[@]}"; do
        gcloud_run_args+=(--update-secrets="${secret}")
    done

    gcloud "${gcloud_run_args[@]}" || print_error "Deployment failed"
    print_success "Deployment completed successfully"
}

main() {
    print_status "Starting deployment for ${SERVICE_NAME} in environment [${ENV}] (Commit: ${GIT_COMMIT})"
    build_image
    deploy_service
}

main
