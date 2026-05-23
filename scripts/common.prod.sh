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