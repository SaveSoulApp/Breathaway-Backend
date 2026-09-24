#!/bin/bash
# scripts/terraform-import.sh
#
# One-time migration script: imports all existing non-prod GCP resources into the
# new remote Terraform state in terraform/environments/non-prod/.
#
# Run this ONCE after:
#   1. Creating the GCS state bucket (see terraform/README.md → Bootstrap)
#   2. Running `terraform init` in terraform/environments/non-prod/
#
# After all imports succeed, run `terraform plan` — it must show zero changes.
#
# Usage:
#   chmod +x scripts/terraform-import.sh
#   ./scripts/terraform-import.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
TF_DIR="${SCRIPT_DIR}/../terraform/environments/non-prod"
PROJECT="breathaway-dev"
REGION="asia-south1"
SERVICE="backend-service"

print_status()  { echo -e "\033[0;34m🔧 $1\033[0m"; }
print_success() { echo -e "\033[0;32m✅ $1\033[0m"; }
print_warning() { echo -e "\033[0;33m⚠️  $1\033[0m"; }
print_error()   { echo -e "\033[0;31m❌ $1\033[0m"; exit 1; }

tf_import() {
  local addr="$1"
  local id="$2"
  echo ""
  print_status "Importing: ${addr}"
  terraform -chdir="${TF_DIR}" import "${addr}" "${id}" || \
    print_warning "Import failed (resource may not exist yet — it will be created on next apply): ${addr}"
}

# ─── Pre-flight ───────────────────────────────────────────────────────────────

print_status "Initializing Terraform (non-prod)..."
terraform -chdir="${TF_DIR}" init -reconfigure

# Fetch the numeric project number (needed for GCP service agent email addresses)
print_status "Fetching project number for ${PROJECT}..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT}" --format="value(projectNumber)")
print_success "Project number: ${PROJECT_NUMBER}"

PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
PUBSUB_INVOKER_SA="pubsub-invoker@${PROJECT}.iam.gserviceaccount.com"
SCHEDULER_INVOKER_SA="scheduler-invoker@${PROJECT}.iam.gserviceaccount.com"

echo ""
print_status "Starting resource imports for project: ${PROJECT}"
echo "════════════════════════════════════════════════════════════"

# ─── GCP API Enablement ───────────────────────────────────────────────────────
# Note: These will succeed even if APIs were enabled manually — importing an
# already-enabled API is safe and idempotent.

print_status "--- GCP API Enablement ---"
for API in \
  "artifactregistry.googleapis.com" \
  "bigquery.googleapis.com" \
  "bigquerystorage.googleapis.com" \
  "cloudbuild.googleapis.com" \
  "cloudkms.googleapis.com" \
  "cloudscheduler.googleapis.com" \
  "iam.googleapis.com" \
  "iamcredentials.googleapis.com" \
  "logging.googleapis.com" \
  "pubsub.googleapis.com" \
  "run.googleapis.com" \
  "secretmanager.googleapis.com" \
  "sts.googleapis.com"; do
  tf_import "google_project_service.required_apis[\"${API}\"]" "${PROJECT}/${API}"
done

# ─── Artifact Registry ────────────────────────────────────────────────────────

print_status "--- Artifact Registry ---"
tf_import "google_artifact_registry_repository.backend_repo" \
  "projects/${PROJECT}/locations/${REGION}/repositories/breathaway-backend"

# ─── Pub/Sub Topics (previously unmanaged — referenced by string in subscriptions) ──

print_status "--- Pub/Sub Topics ---"
tf_import 'google_pubsub_topic.app_topics["credit_expiry"]' \
  "projects/${PROJECT}/topics/credit-expiry"
tf_import 'google_pubsub_topic.app_topics["identity_workflows"]' \
  "projects/${PROJECT}/topics/identity-workflows"
tf_import 'google_pubsub_topic.app_topics["notifications_stream"]' \
  "projects/${PROJECT}/topics/notifications-stream"
tf_import 'google_pubsub_topic.app_topics["meta_webhooks"]' \
  "projects/${PROJECT}/topics/meta-webhooks"

# ─── Pub/Sub Push Subscription Service Account ────────────────────────────────

print_status "--- Pub/Sub Invoker Service Account ---"
tf_import "google_service_account.pubsub_invoker" \
  "projects/${PROJECT}/serviceAccounts/${PUBSUB_INVOKER_SA}"

tf_import "google_service_account_iam_member.pubsub_token_creator" \
  "projects/${PROJECT}/serviceAccounts/${PUBSUB_INVOKER_SA} roles/iam.serviceAccountTokenCreator serviceAccount:${PUBSUB_SA}"

tf_import "google_cloud_run_v2_service_iam_member.pubsub_invoker_run_binding" \
  "projects/${PROJECT}/locations/${REGION}/services/${SERVICE} roles/run.invoker serviceAccount:${PUBSUB_INVOKER_SA}"

# ─── Pub/Sub Push Subscriptions ───────────────────────────────────────────────

print_status "--- Pub/Sub Push Subscriptions ---"
tf_import 'google_pubsub_subscription.push_subscriptions["credit_expiry"]' \
  "projects/${PROJECT}/subscriptions/credit-expiry-push-sub"
tf_import 'google_pubsub_subscription.push_subscriptions["identity_workflows"]' \
  "projects/${PROJECT}/subscriptions/identity-workflows-push-sub"
tf_import 'google_pubsub_subscription.push_subscriptions["notifications_stream"]' \
  "projects/${PROJECT}/subscriptions/notifications-stream-push-sub"
tf_import 'google_pubsub_subscription.push_subscriptions["meta_webhooks"]' \
  "projects/${PROJECT}/subscriptions/meta-webhooks-push-sub"

# ─── Cloud Scheduler ──────────────────────────────────────────────────────────

print_status "--- Cloud Scheduler ---"
tf_import "google_service_account.scheduler_invoker" \
  "projects/${PROJECT}/serviceAccounts/${SCHEDULER_INVOKER_SA}"

tf_import "google_cloud_run_v2_service_iam_member.scheduler_invoker_binding" \
  "projects/${PROJECT}/locations/${REGION}/services/${SERVICE} roles/run.invoker serviceAccount:${SCHEDULER_INVOKER_SA}"

tf_import "google_cloud_scheduler_job.expire_credit_bundles" \
  "projects/${PROJECT}/locations/${REGION}/jobs/expire-credit-bundles-job"
tf_import "google_cloud_scheduler_job.expire_pending_likes" \
  "projects/${PROJECT}/locations/${REGION}/jobs/expire-pending-likes-job"
tf_import "google_cloud_scheduler_job.warn_expiring_credit_bundles" \
  "projects/${PROJECT}/locations/${REGION}/jobs/warn-expiring-credit-bundles-job"

# ─── Audit Logs: Pub/Sub Topic ────────────────────────────────────────────────

print_status "--- Audit Logs: Pub/Sub Topic ---"
tf_import "google_pubsub_topic.audit_logs_topic" \
  "projects/${PROJECT}/topics/audit-logs-topic"

# ─── Audit Logs: IAM ──────────────────────────────────────────────────────────

print_status "--- Audit Logs: IAM ---"
tf_import "google_project_iam_member.pubsub_bq_writer" \
  "${PROJECT} roles/bigquery.dataEditor serviceAccount:${PUBSUB_SA}"

# ─── Audit Logs: BigQuery ─────────────────────────────────────────────────────

print_status "--- Audit Logs: BigQuery ---"
tf_import "google_pubsub_subscription.audit_logs_bq_sub" \
  "projects/${PROJECT}/subscriptions/audit-logs-bq-sub"
tf_import "google_bigquery_dataset.audit_logs_dataset" \
  "${PROJECT}/audit_logs_dataset"
tf_import "google_bigquery_table.audit_logs_events" \
  "${PROJECT}/audit_logs_dataset/events"

# ─── Cloud Logging ────────────────────────────────────────────────────────────

print_status "--- Cloud Logging ---"
tf_import "google_logging_project_bucket_config.app_logs_bucket" \
  "projects/${PROJECT}/locations/${REGION}/buckets/breathaway-app-logs"
tf_import "google_logging_project_sink.app_logs_sink" \
  "projects/${PROJECT}/sinks/breathaway-app-log-sink"
tf_import "google_logging_linked_dataset.app_logs_bq_link" \
  "projects/${PROJECT}/locations/${REGION}/buckets/breathaway-app-logs/links/app_logs_bq_link"

# ─── Secret Manager (import containers if they already exist) ─────────────────
# If a secret doesn't exist yet, the import warning is expected — it will be
# created by `terraform apply`.

print_status "--- Secret Manager Containers ---"
for SECRET in \
  "access-token-instagram" \
  "active-master-key-id" \
  "admin-password" \
  "admin-username" \
  "api-keys" \
  "brevo-api-key" \
  "client-ids" \
  "database-url" \
  "firebase-client-email" \
  "firebase-private-key" \
  "gcp-secret-master-keys" \
  "hmac-key-base64" \
  "ipinfo-token" \
  "jwt-secret" \
  "kms-active-key-id" \
  "kms-key-names" \
  "redis-url" \
  "revenuecat-webhook-secret" \
  "supabase-jwt-private-key" \
  "supabase-service-role-key" \
  "supabase-url" \
  "swagger-password" \
  "swagger-username"; do
  tf_import "google_secret_manager_secret.app_secrets[\"${SECRET}\"]" \
    "projects/${PROJECT}/secrets/${SECRET}"
done

# ─── Workload Identity Federation (if already created manually) ───────────────
# If these don't exist yet, the imports will warn — they'll be created fresh by apply.
#
# NOTE: The existing scripts/setup-wif.sh created a service account named
# "github-actions-cloud-run". Our Terraform declares it as "github-ci".
# If "github-actions-cloud-run" already exists and you want to reuse it,
# either:
#   a) Rename it in GCP console and import as shown below, OR
#   b) Accept that Terraform will create a new "github-ci" SA on apply
#      (and you can deprecate github-actions-cloud-run manually).
# The import below attempts "github-ci" — edit the email if you chose option (a).

print_status "--- Workload Identity Federation (if exists) ---"
tf_import "google_iam_workload_identity_pool.github_pool" \
  "projects/${PROJECT}/locations/global/workloadIdentityPools/github-actions-pool"
tf_import "google_iam_workload_identity_pool_provider.github_provider" \
  "projects/${PROJECT}/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider"

# Attempt to import "github-ci" SA first; falls back gracefully if it doesn't exist yet
tf_import "google_service_account.github_ci" \
  "projects/${PROJECT}/serviceAccounts/github-ci@${PROJECT}.iam.gserviceaccount.com"

# If the old "github-actions-cloud-run" SA is what's in use and you want Terraform to own it,
# uncomment the line below instead (and update account_id in wif.tf to match):
# tf_import "google_service_account.github_ci" \
#   "projects/${PROJECT}/serviceAccounts/github-actions-cloud-run@${PROJECT}.iam.gserviceaccount.com"

# ─── Verification ─────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════"
print_success "Import phase complete!"
echo ""
print_status "Running terraform plan to verify zero drift..."
echo "Expected result: 'No changes. Infrastructure is up-to-date.'"
echo "(New resources like WIF, secrets, and API enablement may still show as 'to be created' — that is OK)"
echo ""
terraform -chdir="${TF_DIR}" plan
