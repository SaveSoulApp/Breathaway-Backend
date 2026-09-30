# Dedicated Service Account for the Public Backend Cloud Run Service
resource "google_service_account" "backend_service" {
  account_id   = "backend-service"
  display_name = "backend-service"
  project      = var.project_id
}

# 1. Grant backend-service Secret Accessor at project level to mount application secrets at boot
resource "google_project_iam_member" "backend_service_secrets_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.backend_service.email}"
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
