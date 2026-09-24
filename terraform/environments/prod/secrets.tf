# secrets.tf — Secret Manager secret containers
#
# ┌─────────────────────────────────────────────────────────────────────────────┐
# │  IMPORTANT: This file creates SECRET CONTAINERS only.                       │
# │  It does NOT set or store secret values anywhere.                           │
# │                                                                             │
# │  After `terraform apply`, populate each secret value manually:              │
# │                                                                             │
# │    echo -n "<value>" | gcloud secrets versions add <secret-id> \           │
# │      --project=<project_id> --data-file=-                                  │
# │                                                                             │
# │  See terraform/README.md → "Post-Apply Secret Checklist" for all 23.       │
# └─────────────────────────────────────────────────────────────────────────────┘

locals {
  # Secret IDs exactly match the names referenced in scripts/deploy.sh
  app_secrets = [
    "access-token-instagram",
    "active-master-key-id",
    "admin-password",
    "admin-username",
    "api-keys",
    "brevo-api-key",
    "client-ids",
    "database-url",
    "firebase-client-email",
    "firebase-private-key",
    "gcp-secret-master-keys",
    "hmac-key-base64",
    "ipinfo-token",
    "jwt-secret",
    "kms-active-key-id",
    "kms-key-names",
    "redis-url",
    "revenuecat-webhook-secret",
    "supabase-jwt-private-key",
    "supabase-service-role-key",
    "supabase-url",
    "swagger-password",
    "swagger-username",
  ]
}

resource "google_secret_manager_secret" "app_secrets" {
  for_each = toset(local.app_secrets)

  secret_id = each.key
  project   = var.project_id

  replication {
    # Automatic replication — GCP chooses optimal replica placement
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}
