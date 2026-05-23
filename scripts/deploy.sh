#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Ensure common.dev.sh exists
if [[ ! -f "${SCRIPT_DIR}/common.dev.sh" ]]; then
    echo -e "\033[0;31m❌ Error: common.dev.sh not found at ${SCRIPT_DIR}/common.dev.sh\033[0m"
    exit 1
fi

source "${SCRIPT_DIR}/common.dev.sh"

# Validate required variables
: "${PROJECT_ID:?Variable PROJECT_ID is not set}"
: "${IMAGE_BASE_URL:?Variable IMAGE_BASE_URL is not set}"
: "${SERVICE_NAME:?Variable SERVICE_NAME is not set}"
: "${REGION:?Variable REGION is not set}"

# Bind image tag to Git Commit Hash
GIT_COMMIT=$(git rev-parse --short HEAD)
IMAGE_TAG_WITH_COMMIT="${IMAGE_BASE_URL}:${GIT_COMMIT}"

print_status() { echo -e "\033[0;34m🔨 $1\033[0m"; }
print_success() { echo -e "\033[0;32m✅ $1\033[0m"; }
print_error() { echo -e "\033[0;31m❌ $1\033[0m"; exit 1; }

build_image() {
    print_status "Checking Artifact Registry for existing image: ${IMAGE_TAG_WITH_COMMIT}"
    
    if gcloud artifacts docker images describe "${IMAGE_TAG_WITH_COMMIT}" --project="${PROJECT_ID}" --quiet >/dev/null 2>&1; then
        print_success "Image already exists! Skipping build phase."
        return 0
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

    # Attach secrets
    for secret in "${secrets[@]}"; do
        gcloud_run_args+=(--update-secrets="${secret}")
    done

    gcloud "${gcloud_run_args[@]}" || print_error "Deployment failed"
    print_success "Deployment completed successfully"
}

main() {
    print_status "Starting deployment for ${SERVICE_NAME} (Commit: ${GIT_COMMIT})"
    build_image
    deploy_service
}

main
