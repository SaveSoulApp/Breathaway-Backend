# wif.tf — Workload Identity Federation for GitHub Actions CI/CD
#
# Replaces any manually downloaded service account keys with short-lived OIDC
# tokens issued by GitHub Actions. The CI service account is tightly scoped to
# only the permissions needed to build and deploy.
#
# After `terraform apply`, set two GitHub Actions secrets:
#   WIF_PROVIDER   = output.wif_provider
#   WIF_SERVICE_ACCOUNT = output.wif_service_account

# ─── Workload Identity Pool ───────────────────────────────────────────────────

resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions CI/CD pipelines"
  project                   = var.project_id

  depends_on = [google_project_service.required_apis]
}

# ─── GitHub OIDC Provider ─────────────────────────────────────────────────────

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC Provider"
  project                            = var.project_id

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  # Only tokens originating from the exact repo are trusted — prevents other
  # repos in the same GitHub org from impersonating the CI service account
  attribute_condition = "assertion.repository == '${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ─── CI Service Account ───────────────────────────────────────────────────────

resource "google_service_account" "github_ci" {
  account_id   = "github-ci"
  display_name = "GitHub Actions CI Service Account"
  description  = "Used by GitHub Actions workflows to build images and deploy to Cloud Run"
  project      = var.project_id
}

# Allow any GitHub Actions token from the configured repo to impersonate the CI SA
resource "google_service_account_iam_member" "github_wif_binding" {
  service_account_id = google_service_account.github_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository/${var.github_repo}"
}

# ─── CI Service Account IAM Roles ────────────────────────────────────────────

# Push/pull Docker images to/from Artifact Registry
resource "google_project_iam_member" "ci_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.github_ci.email}"
}

# Deploy new revisions to Cloud Run (does NOT grant access to invoke the service)
resource "google_project_iam_member" "ci_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.github_ci.email}"
}

# Required by `gcloud run deploy` to act as the Cloud Run runtime service account
resource "google_project_iam_member" "ci_service_account_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.github_ci.email}"
}

# ─── Outputs (for GitHub Actions secrets) ────────────────────────────────────

output "wif_provider" {
  description = "Full WIF provider resource name — copy to GitHub Actions secret: WIF_PROVIDER"
  value       = google_iam_workload_identity_pool_provider.github_provider.name
}

output "wif_service_account" {
  description = "CI service account email — copy to GitHub Actions secret: WIF_SERVICE_ACCOUNT"
  value       = google_service_account.github_ci.email
}
