# main.tf

# Initialize the Google provider (if you haven't already)
provider "google" {
  project = "breathaway-dev"
  region  = "asia-south1"
}

resource "google_artifact_registry_repository" "breathaway_backend_nestjs_repo" {
  location      = "asia-south1"
  repository_id = "breathaway-backend"
  description   = "Docker repository for NestJS app"
  format        = "DOCKER"
  
  # CRITICAL: This must be false to actively delete images. 
  # If true, Artifact Registry only logs a simulation (dry run).
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

  # Rule 2: Keep the 5 most recent versions (Overrides Rule 1)
  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  # Rule 3: Keep production and versioned tags (Overrides Rule 1)
  cleanup_policies {
    id     = "keep-production-tags"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED" # Must be set to TAGGED to use prefixes
      tag_prefixes = ["prod", "v"]
    }
  }
}