# outputs.tf
#
# Development environment outputs re-exported from the backend module.

output "artifact_registry_repository" {
  description = "The name of the Artifact Registry repository"
  value       = module.backend.artifact_registry_repository
}

output "backend_service_account_email" {
  description = "Service account email used by the public backend Cloud Run service"
  value       = module.backend.backend_service_account_email
}

output "maintenance_service_account_email" {
  description = "Service account email used by the maintenance Cloud Run worker service"
  value       = module.backend.maintenance_service_account_email
}

output "scheduler_invoker_service_account_email" {
  description = "Service account email used by Cloud Scheduler to invoke Cloud Run"
  value       = module.backend.scheduler_invoker_service_account_email
}

output "pubsub_invoker_service_account_email" {
  description = "Service account email used by Pub/Sub push subscriptions to invoke Cloud Run"
  value       = module.backend.pubsub_invoker_service_account_email
}

output "dsar_storage_bucket_name" {
  description = "Name of the GCS bucket dedicated to DSAR exports"
  value       = module.backend.dsar_storage_bucket_name
}

output "audit_logs_dataset_id" {
  description = "BigQuery dataset ID for audit log events"
  value       = module.backend.audit_logs_dataset_id
}

output "audit_logs_topic_name" {
  description = "Pub/Sub topic name for audit logs"
  value       = module.backend.audit_logs_topic_name
}
