# main.tf
#
# Development environment entrypoint composing the shared backend module.

provider "google" {
  project = var.project_id
  region  = var.region
}

module "backend" {
  source = "../../modules/backend"

  project_id               = var.project_id
  region                   = var.region
  service_name             = var.service_name
  maintenance_service_name = var.maintenance_service_name
}
