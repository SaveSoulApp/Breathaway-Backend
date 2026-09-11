# audit-logs.tf

# 1. BigQuery Dataset
resource "google_bigquery_dataset" "audit_logs_dataset" {
  dataset_id  = "audit_logs_dataset"
  description = "Dataset for storing application audit logs"
  location    = "asia-south1"
}

# 2. BigQuery Table
resource "google_bigquery_table" "audit_logs_events" {
  dataset_id = google_bigquery_dataset.audit_logs_dataset.dataset_id
  table_id   = "events"

  schema = <<EOF
[
  {
    "name": "data",
    "type": "JSON",
    "mode": "NULLABLE"
  },
  {
    "name": "subscription_name",
    "type": "STRING",
    "mode": "NULLABLE"
  },
  {
    "name": "message_id",
    "type": "STRING",
    "mode": "NULLABLE"
  },
  {
    "name": "publish_time",
    "type": "TIMESTAMP",
    "mode": "NULLABLE"
  },
  {
    "name": "attributes",
    "type": "JSON",
    "mode": "NULLABLE"
  }
]
EOF

  # Important: Set to true if moving to production to prevent accidental data loss
  deletion_protection = false
}

# 3. Pub/Sub Topic
resource "google_pubsub_topic" "audit_logs_topic" {
  name = "audit-logs-topic"

  message_storage_policy {
    allowed_persistence_regions = ["asia-south1"]
  }
}

# 4. Fetch the project number dynamically for the service account
data "google_project" "project" {}

# 5. IAM Permission: Allow Pub/Sub internal agent to write to BigQuery
resource "google_project_iam_member" "pubsub_bq_writer" {
  project = data.google_project.project.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# 6. Pub/Sub Subscription (BigQuery Native Streaming)
resource "google_pubsub_subscription" "audit_logs_bq_sub" {
  name  = "audit-logs-bq-sub"
  topic = google_pubsub_topic.audit_logs_topic.name

  bigquery_config {
    # Format: project_id.dataset_id.table_id
    table               = "${data.google_project.project.project_id}.${google_bigquery_dataset.audit_logs_dataset.dataset_id}.${google_bigquery_table.audit_logs_events.table_id}"
    write_metadata      = true
    drop_unknown_fields = false
  }

  # Ensure the IAM binding exists before trying to create the subscription
  depends_on = [
    google_project_iam_member.pubsub_bq_writer
  ]
}

# ──────────────────────────────────────────────────────────────────────────────
# NEW: Cloud Logging → Log Bucket → BigQuery Linked Dataset
#
# Architecture:
#   NestJS stdout (pino JSON)
#     → Cloud Run log agent
#     → Cloud Logging
#     → Log Bucket (breathaway-app-logs)
#     → BigQuery Linked Dataset (app_logs_dataset)
#
# IMPORTANT: The Terraform state file in this repo is local (no remote backend).
# Confirm `terraform plan` output before applying to the live project.
# ──────────────────────────────────────────────────────────────────────────────

# 7. Cloud Logging Log Bucket
resource "google_logging_project_bucket_config" "app_logs_bucket" {
  project          = data.google_project.project.project_id
  location         = "asia-south1"
  bucket_id        = "breathaway-app-logs"
  description      = "Application observability log bucket for structured Pino logs"
  retention_days   = 90
  enable_analytics = true
}

# 8. Log Sink — routes structured application logs to the Log Bucket
#
# Note: `unique_writer_identity` is intentionally omitted. For log sinks whose
# destination is a log bucket in the SAME project, GCP automatically uses the
# project's Cloud Logging service agent and no explicit IAM grant is required.
# Setting unique_writer_identity = true produces an empty writer_identity for
# same-project bucket destinations, which causes the IAM binding to fail.
resource "google_logging_project_sink" "app_logs_sink" {
  project     = data.google_project.project.project_id
  name        = "breathaway-app-log-sink"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.app_logs_bucket.id}"
  description = "Routes Breathaway API application logs to the observability log bucket"
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.serviceContext.service=\"breathaway-api\""

  depends_on = [google_logging_project_bucket_config.app_logs_bucket]
}

# 9. (Removed — no IAM binding needed for same-project log bucket sinks.
#    GCP's Cloud Logging service agent is granted access implicitly.)

# 10. BigQuery Linked Dataset from Log Bucket
#
# This links the Log Bucket to BigQuery so logs can be queried with SQL.
# The `link_id` becomes the BigQuery dataset name in the project.
#
# Note on arguments:
#   - `parent`  is used instead of `project` (resource-specific field name).
#   - `bucket`  takes the full resource ID from the bucket config (.id).
#   - There is no `bigquery_dataset` block — the link_id itself IS the BQ dataset.
#   - `link_id` must use underscores, not hyphens (GCP naming restriction).
#
# Example query after provisioning:
#   SELECT timestamp, jsonPayload.event, jsonPayload.requestId
#   FROM `breathaway-dev.app_logs_bq_link.cloudlogging_*`
#   WHERE jsonPayload.requestId = 'req-abc123'
#   ORDER BY timestamp ASC
resource "google_logging_linked_dataset" "app_logs_bq_link" {
  link_id     = "app_logs_bq_link"
  bucket      = google_logging_project_bucket_config.app_logs_bucket.id
  parent      = "projects/${data.google_project.project.project_id}"
  location    = "asia-south1"
  description = "BigQuery linked dataset for querying Breathaway application logs"

  depends_on = [
    google_logging_project_bucket_config.app_logs_bucket,
    google_logging_project_sink.app_logs_sink,
  ]
}
