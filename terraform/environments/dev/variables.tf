# variables.tf
#
# Environment variables for Development.

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The default GCP region"
  type        = string
  default     = "asia-south1"
}

variable "service_name" {
  description = "The Cloud Run service name of the public backend"
  type        = string
  default     = "backend-service"
}

variable "maintenance_service_name" {
  description = "The Cloud Run service name of the maintenance worker service"
  type        = string
  default     = "maintenance-service"
}
