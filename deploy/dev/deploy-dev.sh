#!/bin/bash

set -e  # Exit on any error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo "${BLUE}🔨 $1${NC}"
}

print_success() {
    echo "${GREEN}✅ $1${NC}"
}

print_error() {
    echo "${RED}❌ $1${NC}"
}

print_warning() {
    echo "${YELLOW}⚠️  $1${NC}"
}

# Function to build Docker image
build_image() {
    print_status "Building Docker image..."
    echo "   Image: ${IMAGE_TAG}"
    echo "   Project: ${PROJECT_ID}"
    echo ""

    gcloud builds submit \
        --tag "${IMAGE_TAG}" \
        --project "${PROJECT_ID}" \
        --timeout=900s || {
        print_error "Docker build failed"
        return 1
    }

    print_success "Build completed successfully"
    echo ""
}

# Function to deploy to Cloud Run
deploy_service() {
    print_status "Deploying to Cloud Run..."
    echo "   Service: ${SERVICE_NAME}"
    echo "   Region: ${REGION}"
    echo "   Image: ${IMAGE_TAG}"
    echo ""

    # Get project root directory
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

    # Define secrets as an array for better maintainability
    secrets=(
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

    # Check if env.dev.yaml file exists
    if [[ ! -f "${PROJECT_ROOT}/.env.dev.yaml" ]]; then
        print_warning ".env.dev.yaml file not found at ${PROJECT_ROOT}/.env.dev.yaml"
        print_warning "Continuing deployment without environment variables file"
        ENV_VARS_FLAG=""
    else
        ENV_VARS_FLAG="--env-vars-file=\"${PROJECT_ROOT}/.env.dev.yaml\""
    fi

    # Build the gcloud command
    gcloud_command="gcloud run deploy \"${SERVICE_NAME}\" \
        --image=\"${IMAGE_TAG}\" \
        --platform=managed \
        --region=\"${REGION}\" \
        --memory=2Gi \
        --cpu=2 \
        --allow-unauthenticated"

    # Add environment variables file if it exists
    if [[ -n "$ENV_VARS_FLAG" ]]; then
        gcloud_command+=" $ENV_VARS_FLAG"
    fi

    # Add each secret to the command
    for secret in "${secrets[@]}"; do
        gcloud_command+=" --update-secrets=\"${secret}\""
    done

    gcloud_command+=" --quiet"

    # Execute the command
    print_status "Executing deployment command..."
    eval $gcloud_command || {
        print_error "Deployment failed"
        return 1
    }

    print_success "Deployment completed successfully"
}

# Main deployment function
main() {
    echo ""
    print_status "Starting complete deployment process for ${PROJECT_ID}"
    echo "=========================================="
    echo ""

    # Build the Docker image
    if ! build_image; then
        print_error "Build phase failed. Aborting deployment."
        exit 1
    fi

    echo "------------------------------------------"
    echo ""

    # Deploy to Cloud Run
    if ! deploy_service; then
        print_error "Deployment phase failed."
        exit 1
    fi

    echo ""
    echo "=========================================="
    print_success "Complete deployment process finished successfully!"
    
    # Get the service URL
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
        --platform=managed \
        --region="${REGION}" \
        --format="value(status.url)" \
        --quiet 2>/dev/null || echo "")
    
    if [[ -n "$SERVICE_URL" ]]; then
        echo ""
        print_success "Service is available at: ${SERVICE_URL}"
    fi
}

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Complete deployment script for development environment"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -b, --build    Only build the Docker image"
    echo "  -d, --deploy   Only deploy to Cloud Run (assumes image is already built)"
    echo ""
    echo "Examples:"
    echo "  $0              # Complete build and deploy"
    echo "  $0 --build      # Only build the Docker image"
    echo "  $0 --deploy     # Only deploy to Cloud Run"
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -b|--build)
        print_status "Running build only..."
        build_image
        exit 0
        ;;
    -d|--deploy)
        print_status "Running deploy only..."
        deploy_service
        exit 0
        ;;
    "")
        # No arguments, run full deployment
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo ""
        show_help
        exit 1
        ;;
esac