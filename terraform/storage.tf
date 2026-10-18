# storage.tf
#
# Dedicated Cloud Storage Bucket for DSAR Data Portability Exports (GDPR Art. 15/20 & CCPA § 1798.110)
#
# Configured with:
# - Uniform bucket-level access (no public access)
# - Standard storage class in primary region
# - Automated 7-day lifecycle purge rule to clean up expired archives

resource "google_storage_bucket" "dsar_exports" {
  name                        = "${var.project_id}-dsar-exports"
  location                    = "asia-south1"
  project                     = var.project_id
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  # GDPR compliance & storage hygiene: automatically purge archives older than 7 days
  lifecycle_rule {
    condition {
      age = 7 # days
    }
    action {
      type = "Delete"
    }
  }
}
