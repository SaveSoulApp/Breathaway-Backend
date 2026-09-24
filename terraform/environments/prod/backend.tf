terraform {
  backend "gcs" {
    bucket = "breathaway-terraform-state"
    prefix = "state/prod"
  }
}
