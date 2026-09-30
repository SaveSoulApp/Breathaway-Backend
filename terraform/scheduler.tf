# Variables (You can extract these to variables.tf if you prefer)
variable "project_id" {
  type    = string
  default = "breathaway-dev"
}

variable "region" {
  type    = string
  default = "asia-south1"
}

variable "service_name" {
  type    = string
  default = "backend-service"
}

variable "maintenance_service_name" {
  type    = string
  default = "maintenance-service"
}

# Data block to get the deployed backend Cloud Run service details dynamically (like its URL)
data "google_cloud_run_v2_service" "backend_service" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
}

# 1. Create the Cloud Scheduler Invoker Service Account
resource "google_service_account" "scheduler_invoker" {
  account_id   = "scheduler-invoker"
  display_name = "Cloud Scheduler Invoker"
  project      = var.project_id
}

# 2. Grant permissions so the scheduler can securely invoke the public Cloud Run service (backward compatibility)
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker_binding" {
  name     = data.google_cloud_run_v2_service.backend_service.name
  location = data.google_cloud_run_v2_service.backend_service.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

# 3. Create the Dedicated Maintenance Service Account (Option B - Privileged Worker Isolation)
resource "google_service_account" "maintenance_runner" {
  account_id   = "maintenance-runner"
  display_name = "Cloud Run Maintenance Service Runner"
  project      = var.project_id
}

# 4. IAM: Grant maintenance-runner rights to add new versions strictly to the Instagram secret
resource "google_secret_manager_secret_iam_member" "maintenance_runner_instagram_adder" {
  project   = var.project_id
  secret_id = "access-token-instagram"
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${google_service_account.maintenance_runner.email}"
}

# 5. IAM: Grant maintenance-runner rights to read the Instagram secret
resource "google_secret_manager_secret_iam_member" "maintenance_runner_instagram_accessor" {
  project   = var.project_id
  secret_id = "access-token-instagram"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.maintenance_runner.email}"
}

# 6. IAM: Grant maintenance-runner Secret Accessor at project level to mount application secrets at boot
resource "google_project_iam_member" "maintenance_runner_secrets_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.maintenance_runner.email}"
}

# 7. IAM: Grant maintenance-runner Cloud SQL Client to allow connecting to Cloud SQL for maintenance jobs
resource "google_project_iam_member" "maintenance_runner_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.maintenance_runner.email}"
}

# 8. Data block to dynamically query the deployed Maintenance Cloud Run service
data "google_cloud_run_v2_service" "maintenance_service" {
  name     = var.maintenance_service_name
  location = var.region
  project  = var.project_id
}

# 9. Grant permissions so the scheduler can securely invoke the Maintenance Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "scheduler_maintenance_invoker_binding" {
  name     = data.google_cloud_run_v2_service.maintenance_service.name
  location = data.google_cloud_run_v2_service.maintenance_service.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

# 10. Create the Monthly Instagram Token Rotation Job (Runs 1st of every month at midnight UTC)
resource "google_cloud_scheduler_job" "rotate_instagram_token_job" {
  name        = "rotate-instagram-token-job"
  description = "Monthly rotation of Instagram Long-Lived User Access Token via Maintenance Service"
  schedule    = "0 0 1 * *"
  time_zone   = "UTC"
  region      = var.region
  project     = var.project_id

  retry_config {
    retry_count          = 3
    min_backoff_duration = "10s"
    max_backoff_duration = "300s"
    max_doublings        = 2
  }

  http_target {
    http_method = "POST"
    uri         = "${data.google_cloud_run_v2_service.maintenance_service.uri}/api/v1/internal/jobs/rotate-instagram-token"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = data.google_cloud_run_v2_service.maintenance_service.uri
    }
  }
}

# 11. Create the Expire Bundles Job (Runs daily at midnight)
resource "google_cloud_scheduler_job" "expire_credit_bundles_job" {
  name        = "expire-credit-bundles-job"
  description = "Internal job to expire unused credit bundles via Maintenance Service"
  schedule    = "0 0 * * *"
  time_zone   = "UTC"
  region      = var.region
  project     = var.project_id

  http_target {
    http_method = "POST"
    uri         = "${data.google_cloud_run_v2_service.maintenance_service.uri}/api/v1/internal/jobs/expire-bundles"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = data.google_cloud_run_v2_service.maintenance_service.uri
    }
  }
}

# 12. Create the Warn Expiring Bundles Job (Runs daily at 10:00 AM)
resource "google_cloud_scheduler_job" "warn_expiring_credit_bundles_job" {
  name        = "warn-expiring-credit-bundles-job"
  description = "Internal job to fan-out warnings for credit bundles expiring in 7 days via Maintenance Service"
  schedule    = "0 10 * * *"
  time_zone   = "UTC"
  region      = var.region
  project     = var.project_id

  http_target {
    http_method = "POST"
    uri         = "${data.google_cloud_run_v2_service.maintenance_service.uri}/api/v1/internal/jobs/warn-expiring-bundles"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = data.google_cloud_run_v2_service.maintenance_service.uri
    }
  }
}

# 13. Create the Reconcile Payments Job (Runs every 30 minutes)
resource "google_cloud_scheduler_job" "reconcile_payments_job" {
  name        = "reconcile-payments-job"
  description = "Polls stale PENDING payment orders against the gateway and settles their status via Maintenance Service"
  schedule    = "*/30 * * * *"
  time_zone   = "UTC"
  region      = var.region
  project     = var.project_id

  retry_config {
    retry_count          = 3
    min_backoff_duration = "5s"
    max_backoff_duration = "60s"
    max_doublings        = 2
  }

  http_target {
    http_method = "POST"
    uri         = "${data.google_cloud_run_v2_service.maintenance_service.uri}/api/v1/internal/jobs/reconcile-payments"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = data.google_cloud_run_v2_service.maintenance_service.uri
    }
  }
}
