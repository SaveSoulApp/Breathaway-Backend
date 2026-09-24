variable "project_id" {
  type        = string
  description = "GCP project ID for this environment"
}

variable "region" {
  type        = string
  description = "Primary GCP region for all resources"
}

variable "environment" {
  type        = string
  description = "Deployment environment label (non-prod or prod)"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name (must already be deployed before running terraform)"
}

variable "github_repo" {
  type        = string
  description = "GitHub owner/repo for Workload Identity Federation binding (e.g. SaveSoulApp/Breathaway-Backend)"
}

variable "app_log_name" {
  type        = string
  description = "Value of the APP_NAME env var set on Cloud Run — used in the Cloud Logging sink filter to route only this app's logs"
}

variable "bigquery_deletion_protection" {
  type        = bool
  description = "Set true in production to prevent accidental BigQuery table deletion. Always false in non-prod."
}
