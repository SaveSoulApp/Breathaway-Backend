# scheduler.tf — Cloud Scheduler jobs for internal background tasks
#
# All jobs invoke dedicated internal Cloud Run endpoints via OIDC authentication
# using a scheduler-invoker service account. Internal endpoints (/api/v1/internal/*)
# are protected by the OIDC token check — never called directly by clients.

# ─── Scheduler Invoker Service Account ───────────────────────────────────────

resource "google_service_account" "scheduler_invoker" {
  account_id   = "scheduler-invoker"
  display_name = "Cloud Scheduler Invoker"
  project      = var.project_id
}

# Allow the scheduler-invoker SA to invoke the Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker_binding" {
  name     = data.google_cloud_run_v2_service.backend_service.name
  location = data.google_cloud_run_v2_service.backend_service.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

# ─── Scheduled Jobs ───────────────────────────────────────────────────────────

# Runs daily at midnight UTC — marks expired credit bundles as void
resource "google_cloud_scheduler_job" "expire_credit_bundles" {
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

# Runs daily at 01:00 UTC — voids pending likes exceeding the 90-day TTL
resource "google_cloud_scheduler_job" "expire_pending_likes" {
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

# Runs daily at 10:00 UTC — fans out warning notifications for bundles expiring within 7 days
resource "google_cloud_scheduler_job" "warn_expiring_credit_bundles" {
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
