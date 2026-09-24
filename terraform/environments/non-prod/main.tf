# main.tf — GCP API enablement and shared data sources
#
# All other resource files in this directory depend on the API enablement and
# data sources declared here.

# ─── GCP API Enablement ───────────────────────────────────────────────────────

locals {
  required_apis = [
    "artifactregistry.googleapis.com",
    "bigquery.googleapis.com",
    "bigquerystorage.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com", # Required for Workload Identity Federation token exchange
    "logging.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sts.googleapis.com", # Required for Workload Identity Federation
  ]
}

resource "google_project_service" "required_apis" {
  for_each = toset(local.required_apis)

  project = var.project_id
  service = each.key

  # Prevent accidental API disablement from deleting downstream resources
  disable_on_destroy = false
}

# ─── Data Sources ─────────────────────────────────────────────────────────────

# Fetches the numeric project number needed for GCP service agent email addresses
# (e.g., service-<number>@gcp-sa-pubsub.iam.gserviceaccount.com)
data "google_project" "project" {
  project_id = var.project_id
}

# Fetches the live Cloud Run service URL — used by Pub/Sub subscriptions and
# Cloud Scheduler to construct authenticated push endpoints.
#
# PREREQUISITE: The Cloud Run service must be deployed before running terraform.
# Run `scripts/deploy.sh --env=<non-prod|prod>` first if this is a fresh project.
data "google_cloud_run_v2_service" "backend_service" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
}
