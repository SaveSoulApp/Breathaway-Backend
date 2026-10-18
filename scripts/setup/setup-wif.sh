#!/bin/bash

# ==============================================================================
# Workload Identity Federation Setup for GitHub Actions
# ==============================================================================
# Run this script locally to set up passwordless authentication for GitHub Actions.
# Make sure you are logged in to gcloud before running: `gcloud auth login`
# ==============================================================================

PROJECT_ID="breathaway-dev" # Replace with your actual GCP Project ID
GITHUB_REPO="SaveSoulApp/Breathaway-Backend" # Replace with your actual GitHub username/repo (e.g., SaveSoulApp/Breathaway-Backend)

SERVICE_ACCOUNT_NAME="github-actions-cloud-run"
POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-provider"

echo "Setting up Workload Identity Federation for $GITHUB_REPO on project $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# 1. Enable Required APIs
echo "Enabling IAM Credentials API..."
gcloud services enable iamcredentials.googleapis.com

# 2. Create the Service Account (Skip if it already exists)
echo "Creating Service Account ($SERVICE_ACCOUNT_NAME)..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
    --display-name="GitHub Actions Cloud Run Manager" || echo "Service account may already exist, continuing..."

SA_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Give the Service Account permissions to manage Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/run.admin"

# 3. Create the Workload Identity Pool
echo "Creating Workload Identity Pool ($POOL_NAME)..."
gcloud iam workload-identity-pools create $POOL_NAME \
    --location="global" \
    --display-name="GitHub Actions Pool" || echo "Pool may already exist, continuing..."

export POOL_ID=$(gcloud iam workload-identity-pools describe $POOL_NAME \
  --location="global" --format="value(name)")

# 4. Create the Workload Identity Provider
echo "Creating Workload Identity Provider ($PROVIDER_NAME)..."
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
    --location="global" \
    --workload-identity-pool=$POOL_NAME \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '$GITHUB_REPO'" \
    --issuer-uri="https://token.actions.githubusercontent.com" || echo "Provider may already exist, continuing..."

export PROVIDER_ID=$(gcloud iam workload-identity-pools providers describe $PROVIDER_NAME \
  --location="global" --workload-identity-pool=$POOL_NAME --format="value(name)")

# 5. Bind the Service Account to the specific GitHub Repository
echo "Binding Service Account to GitHub Repository ($GITHUB_REPO)..."
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/$POOL_ID/attribute.repository/$GITHUB_REPO"

echo "======================================================================"
echo "✅ SETUP COMPLETE! Add the following as Secrets in your GitHub Repo:"
echo "======================================================================"
echo "Secret Name: WIF_PROVIDER"
echo "Secret Value: $PROVIDER_ID"
echo ""
echo "Secret Name: WIF_SERVICE_ACCOUNT"
echo "Secret Value: $SA_EMAIL"
echo "======================================================================"
