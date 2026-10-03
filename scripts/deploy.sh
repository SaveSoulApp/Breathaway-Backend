#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
ENV="dev"
FORCE_BUILD="false"
DEPLOY_PUBLIC="true"
DEPLOY_MAINTENANCE="true"

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
        --no-maintenance)
            DEPLOY_MAINTENANCE="false"
            shift
            ;;
        --only-maintenance)
            DEPLOY_PUBLIC="false"
            DEPLOY_MAINTENANCE="true"
            shift
            ;;
        --only-public)
            DEPLOY_PUBLIC="true"
            DEPLOY_MAINTENANCE="false"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --env=<dev|prod>, -e <dev|prod>   Target deployment environment (default: dev)"
            echo "  --force                           Force Docker image rebuild even if tag exists"
            echo "  --no-maintenance                  Skip deploying the internal maintenance-service"
            echo "  --only-maintenance                Deploy only the internal maintenance-service"
            echo "  --only-public                     Deploy only the public backend-service"
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

# Shared runtime secrets across services
SECRETS_CONFIG_FILE="${SCRIPT_DIR}/common.secrets.sh"
if [[ ! -f "${SECRETS_CONFIG_FILE}" ]]; then
    print_error "Secrets configuration not found at ${SECRETS_CONFIG_FILE}"
fi

source "${SECRETS_CONFIG_FILE}"

# Helper function to generate serialized environment variable string (^~^VAR1=VAL1~VAR2=VAL2)
build_env_vars_string() {
    local swagger_enabled="${1:-${SWAGGER_ENABLED}}"

    local env_vars=(
        "NODE_ENV=${NODE_ENV}"
        "LOG_LEVEL=${LOG_LEVEL}"
        "SHOULD_LOG_RESPONSE=${SHOULD_LOG_RESPONSE}"
        "DEPLOYMENT_ENV=${DEPLOYMENT_ENV}"
        "APP_NAME=${APP_NAME}"
        "REQUIRED_PLATFORMS=${REQUIRED_PLATFORMS}"
        "MIN_APP_VERSION=${MIN_APP_VERSION}"
        "CORS_ORIGINS=${CORS_ORIGINS}"
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
        "SWAGGER_ENABLED=${swagger_enabled}"
        "GCP_OIDC_AUDIENCE=${GCP_OIDC_AUDIENCE}"
        "AUDIT_PUBSUB_TOPIC=${AUDIT_PUBSUB_TOPIC}"
        "CREDIT_EXPIRY_DAYS=${CREDIT_EXPIRY_DAYS}"
        "LIKE_EXPIRY_DAYS=${LIKE_EXPIRY_DAYS}"
        "DB_POOL_MAX=${DB_POOL_MAX:-4}"
        "DB_POOL_MIN=${DB_POOL_MIN:-0}"
        "DB_POOL_ACQUISITION_TIMEOUT_MS=${DB_POOL_ACQUISITION_TIMEOUT_MS:-5000}"
        "DB_POOL_IDLE_TIMEOUT_MS=${DB_POOL_IDLE_TIMEOUT_MS:-10000}"
        "DB_POOL_STATEMENT_TIMEOUT_MS=${DB_POOL_STATEMENT_TIMEOUT_MS:-15000}"
        "DEFAULT_COUNTRY_CODE=${DEFAULT_COUNTRY_CODE}"
        "IPINFO_TIMEOUT_MS=${IPINFO_TIMEOUT_MS}"
        "SUPABASE_JWT_KEY_ID=${SUPABASE_JWT_KEY_ID:-}"
    )

    # Join environment variables with ~ delimiter to handle commas safely (e.g. REQUIRED_PLATFORMS)
    local env_vars_str="^~^"
    for ev in "${env_vars[@]}"; do
        env_vars_str="${env_vars_str}${ev}~"
    done
    echo "${env_vars_str%~}"
}

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

# Generic Cloud Run deployment handler
deploy_cloud_run_service() {
    local target_service="$1"
    local service_account="$2"
    local ingress="$3"
    local allow_unauthenticated="$4"
    local cpu="$5"
    local memory="$6"
    local max_instances="$7"
    local concurrency="$8"
    local swagger_enabled="$9"

    print_status "Deploying to Cloud Run: ${target_service} (${REGION}) [CPU: ${cpu}, Memory: ${memory}, Concurrency: ${concurrency}, Ingress: ${ingress}]"

    local gcloud_run_args=(
        run deploy "${target_service}"
        --image="${IMAGE_TAG_WITH_COMMIT}"
        --region="${REGION}"
        --cpu="${cpu}"
        --memory="${memory}"
        --max-instances="${max_instances}"
        --concurrency="${concurrency}"
        --service-account="${service_account}"
        --ingress="${ingress}"
        --quiet
    )

    if [[ "${allow_unauthenticated}" == "true" ]]; then
        gcloud_run_args+=(--allow-unauthenticated)
    else
        gcloud_run_args+=(--no-allow-unauthenticated)
    fi

    # Attach serialized environment variables
    local env_vars_str
    env_vars_str="$(build_env_vars_string "${swagger_enabled}")"
    gcloud_run_args+=(--set-env-vars="${env_vars_str}")

    # Attach shared secrets
    for secret in "${COMMON_SECRETS[@]}"; do
        gcloud_run_args+=(--update-secrets="${secret}")
    done
    gcloud_run_args+=(--remove-secrets="PUBSUB_VERIFICATION_TOKEN")

    gcloud "${gcloud_run_args[@]}" || print_error "Deployment failed for ${target_service}"
    print_success "Deployment completed successfully for ${target_service}"
}

deploy_public_service() {
    local backend_sa="${BACKEND_SERVICE_ACCOUNT:-backend-service@${PROJECT_ID}.iam.gserviceaccount.com}"
    deploy_cloud_run_service \
        "${SERVICE_NAME}" \
        "${backend_sa}" \
        "all" \
        "true" \
        "${CPU:-2}" \
        "${MEMORY:-2Gi}" \
        "${MAX_INSTANCES:-20}" \
        "${CONCURRENCY:-160}" \
        "${SWAGGER_ENABLED:-true}"
}

deploy_maintenance_service() {
    local maint_service="${MAINTENANCE_SERVICE_NAME:-maintenance-service}"
    local maint_sa="${MAINTENANCE_SERVICE_ACCOUNT:-maintenance-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
    deploy_cloud_run_service \
        "${maint_service}" \
        "${maint_sa}" \
        "all" \
        "false" \
        "${MAINTENANCE_CPU:-2}" \
        "${MAINTENANCE_MEMORY:-2Gi}" \
        "${MAINTENANCE_MAX_INSTANCES:-5}" \
        "${MAINTENANCE_CONCURRENCY:-80}" \
        "false"
}

main() {
    print_status "Starting deployment for ${SERVICE_NAME} in environment [${ENV}] (Commit: ${GIT_COMMIT})"
    build_image
    if [[ "${DEPLOY_PUBLIC}" == "true" ]]; then
        deploy_public_service
    fi
    if [[ "${DEPLOY_MAINTENANCE}" == "true" ]]; then
        deploy_maintenance_service
    fi
}

main
