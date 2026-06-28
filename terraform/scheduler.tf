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

# Data block to get the deployed Cloud Run service details dynamically (like its URL)
data "google_cloud_run_v2_service" "backend_service" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
}

# 1. Create the Service Account
resource "google_service_account" "scheduler_invoker" {
  account_id   = "scheduler-invoker"
  display_name = "Cloud Scheduler Invoker"
  project      = var.project_id
}

# 2. Grant permissions so the scheduler can securely invoke the Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker_binding" {
  name     = data.google_cloud_run_v2_service.backend_service.name
  location = data.google_cloud_run_v2_service.backend_service.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

# 3. Create the Expire Bundles Job (Runs daily at midnight)
resource "google_cloud_scheduler_job" "expire_credit_bundles_job" {
  name        = "expire-credit-bundles-job"
  description = "Internal job to expire unused credit bundles"
  schedule    = "0 0 * * *"
  time_zone   = "UTC"
  region      = var.region
  project     = var.project_id

  http_target {
    http_method = "POST"
    uri         = "${data.google_cloud_run_v2_service.backend_service.uri}/api/v1/internal/jobs/expire-bundles"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = data.google_cloud_run_v2_service.backend_service.uri
    }
  }
}

# 4. Create the Expire Likes Job (Runs daily at 1:00 AM)
resource "google_cloud_scheduler_job" "expire_pending_likes_job" {
  name        = "expire-pending-likes-job"
  description = "Internal job to void pending likes exceeding 90-day TTL"
  schedule    = "0 1 * * *"
  time_zone   = "UTC"
  region      = var.region
  project     = var.project_id

  http_target {
    http_method = "POST"
    uri         = "${data.google_cloud_run_v2_service.backend_service.uri}/api/v1/internal/jobs/expire-likes"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = data.google_cloud_run_v2_service.backend_service.uri
    }
  }
}

# 5. Create the Warn Expiring Bundles Job (Runs daily at 10:00 AM)
resource "google_cloud_scheduler_job" "warn_expiring_credit_bundles_job" {
  name        = "warn-expiring-credit-bundles-job"
  description = "Internal job to fan-out warnings for credit bundles expiring in 7 days"
  schedule    = "0 10 * * *"
  time_zone   = "UTC"
  region      = var.region
  project     = var.project_id

  http_target {
    http_method = "POST"
    uri         = "${data.google_cloud_run_v2_service.backend_service.uri}/api/v1/internal/jobs/warn-expiring-bundles"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = data.google_cloud_run_v2_service.backend_service.uri
    }
  }
}
