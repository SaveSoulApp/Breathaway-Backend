# outputs.tf
#
# Module outputs for Breathaway Backend GCP Infrastructure.

output "artifact_registry_repository" {
  description = "The name of the Artifact Registry repository"
  value       = google_artifact_registry_repository.breathaway_backend_nestjs_repo.name
}

output "backend_service_account_email" {
  description = "Service account email used by the public backend Cloud Run service"
  value       = google_service_account.backend_service.email
}

output "maintenance_service_account_email" {
  description = "Service account email used by the maintenance Cloud Run worker service"
  value       = google_service_account.maintenance_runner.email
}

output "scheduler_invoker_service_account_email" {
  description = "Service account email used by Cloud Scheduler to invoke Cloud Run"
  value       = google_service_account.scheduler_invoker.email
}

output "pubsub_invoker_service_account_email" {
  description = "Service account email used by Pub/Sub push subscriptions to invoke Cloud Run"
  value       = google_service_account.pubsub_invoker.email
}

output "dsar_storage_bucket_name" {
  description = "Name of the GCS bucket dedicated to DSAR exports"
  value       = google_storage_bucket.dsar_exports.name
}

output "audit_logs_dataset_id" {
  description = "BigQuery dataset ID for audit log events"
  value       = google_bigquery_dataset.audit_logs_dataset.dataset_id
}

output "audit_logs_topic_name" {
  description = "Pub/Sub topic name for audit logs"
  value       = google_pubsub_topic.audit_logs_topic.name
}
