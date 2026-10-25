#!/bin/bash
set -euo pipefail

# ==============================================================================
# Workload Identity Federation Setup for GitHub Actions
# ==============================================================================
# Run this script locally to set up passwordless authentication for GitHub Actions.
# Make sure you are logged in to gcloud before running: `gcloud auth login`
# ==============================================================================

PROJECT_ID="${1:-${PROJECT_ID:-breathaway-development}}"
GITHUB_REPO="SaveSoulApp/Breathaway-Backend"

SERVICE_ACCOUNT_NAME="github-actions-cloud-run"
POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-provider"

echo "Setting up Workload Identity Federation for $GITHUB_REPO on project $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# 1. Enable Required APIs
echo "Enabling Required APIs (IAM Credentials, Resource Manager, Cloud Run, Cloud Build, Artifact Registry)..."
gcloud services enable \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

# 2. Create the Service Account (Skip if it already exists)
echo "Creating Service Account ($SERVICE_ACCOUNT_NAME)..."
gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="GitHub Actions Cloud Run Manager" \
    --project="$PROJECT_ID" || echo "Service account may already exist, continuing..."

SA_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Grant required CI/CD deployment roles
ROLES=(
  "roles/run.admin"
  "roles/artifactregistry.writer"
  "roles/cloudbuild.builds.editor"
  "roles/iam.serviceAccountUser"
  "roles/storage.admin"
  "roles/secretmanager.viewer"
  "roles/logging.viewer"
  "roles/serviceusage.serviceUsageConsumer"
  "roles/viewer"
)

echo "Granting deployment IAM roles to $SA_EMAIL..."
for role in "${ROLES[@]}"; do
  echo " - Assigning $role..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

# 3. Create the Workload Identity Pool
echo "Creating Workload Identity Pool ($POOL_NAME)..."
gcloud iam workload-identity-pools create "$POOL_NAME" \
    --location="global" \
    --display-name="GitHub Actions Pool" \
    --project="$PROJECT_ID" || echo "Pool may already exist, continuing..."

POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --location="global" --project="$PROJECT_ID" --format="value(name)")

# 4. Create the Workload Identity Provider
echo "Creating Workload Identity Provider ($PROVIDER_NAME)..."
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
    --location="global" \
    --workload-identity-pool="$POOL_NAME" \
    --project="$PROJECT_ID" \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '$GITHUB_REPO'" \
    --issuer-uri="https://token.actions.githubusercontent.com" || echo "Provider may already exist, continuing..."

PROVIDER_ID=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --location="global" --workload-identity-pool="$POOL_NAME" --project="$PROJECT_ID" --format="value(name)")

# 5. Bind the Service Account to the specific GitHub Repository
echo "Binding Service Account to GitHub Repository ($GITHUB_REPO)..."
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --project="$PROJECT_ID" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/$POOL_ID/attribute.repository/$GITHUB_REPO" \
    --quiet >/dev/null

echo "======================================================================"
echo "✅ SETUP COMPLETE! Add the following as Secrets in your GitHub Repo:"
echo "======================================================================"
echo "Secret Name: WIF_PROVIDER"
echo "Secret Value: $PROVIDER_ID"
echo ""
echo "Secret Name: WIF_SERVICE_ACCOUNT"
echo "Secret Value: $SA_EMAIL"
echo "======================================================================"
