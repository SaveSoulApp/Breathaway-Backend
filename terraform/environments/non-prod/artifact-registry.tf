# artifact-registry.tf — Docker image repository with automated cleanup policies

resource "google_artifact_registry_repository" "backend_repo" {
  location      = var.region
  repository_id = "breathaway-backend"
  description   = "Docker repository for NestJS backend"
  format        = "DOCKER"
  project       = var.project_id

  # Actively delete old images — dry_run=false means GCP executes deletions, not just logs them
  cleanup_policy_dry_run = false

  # Rule 1: Delete all versions older than 10 days
  cleanup_policies {
    id     = "delete-older-than-10-days"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "864000s" # 10 days in seconds
    }
  }

  # Rule 2: Always keep the 5 most recent versions regardless of age (overrides Rule 1)
  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  # Rule 3: Always keep production and semver-tagged images (overrides Rule 1)
  cleanup_policies {
    id     = "keep-production-tags"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["prod", "v"]
    }
  }

  depends_on = [google_project_service.required_apis]
}
