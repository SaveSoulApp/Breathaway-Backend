# variables.tf
# Module input variables for Breathaway Backend GCP Infrastructure

variable "project_id" {
  description = "The GCP project ID where infrastructure is deployed"
  type        = string
}

variable "region" {
  description = "The default GCP region for regional resources"
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

variable "instagram_secret_name" {
  description = "Secret Manager secret identifier for the Instagram access token"
  type        = string
  default     = "access-token-instagram"
}
