# backend.tf
#
# Remote state configuration for the Development environment.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.33.0"
    }
  }

  backend "gcs" {
    bucket = "breathaway-development-terraform-state"
    prefix = "dev"
  }
}
