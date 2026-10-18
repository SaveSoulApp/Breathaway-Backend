# Dedicated Service Account for the Public Backend Cloud Run Service
resource "google_service_account" "backend_service" {
  account_id   = "backend-service"
  display_name = "backend-service"
  project      = var.project_id
}

# 1. Grant backend-service Secret Accessor strictly on required secrets (Least Privilege)
resource "google_secret_manager_secret_iam_member" "backend_service_secrets_accessor" {
  for_each  = toset(local.backend_common_secrets)
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend_service.email}"
}

# 2. Grant backend-service Cloud SQL Client to allow connecting to Cloud SQL database
resource "google_project_iam_member" "backend_service_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backend_service.email}"
}

# 3. Grant backend-service Pub/Sub Publisher to publish domain events and audit logs
resource "google_project_iam_member" "backend_service_pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.backend_service.email}"
}

# 4. Grant backend-service Cloud KMS CryptoKey Encrypter/Decrypter for field encryption
resource "google_project_iam_member" "backend_service_kms_encrypter_decrypter" {
  project = var.project_id
  role    = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member  = "serviceAccount:${google_service_account.backend_service.email}"
}

# 5. Grant backend-service Browser role to allow reading project IAM policy for Admin OIDC authorization
resource "google_project_iam_member" "backend_service_browser" {
  project = var.project_id
  role    = "roles/browser"
  member  = "serviceAccount:${google_service_account.backend_service.email}"
}

# 6. Grant backend-service Storage Object Admin on the DSAR exports bucket
resource "google_storage_bucket_iam_member" "backend_service_dsar_storage" {
  bucket = google_storage_bucket.dsar_exports.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend_service.email}"
}

# 7. Grant backend-service Service Account Token Creator on itself for V4 signed URL signing
resource "google_service_account_iam_member" "backend_service_token_creator" {
  service_account_id = google_service_account.backend_service.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.backend_service.email}"
}

# 8. Grant backend-service BigQuery Data Viewer and Job User for audit log export queries
resource "google_project_iam_member" "backend_service_bigquery_viewer" {
  project = var.project_id
  role    = "roles/bigquery.dataViewer"
  member  = "serviceAccount:${google_service_account.backend_service.email}"
}

resource "google_project_iam_member" "backend_service_bigquery_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.backend_service.email}"
}

