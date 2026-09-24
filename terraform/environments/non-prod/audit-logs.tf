# audit-logs.tf
#
# Two observability pipelines are defined here:
#
# Pipeline A — Business Audit Logs:
#   App → google_pubsub_topic.audit_logs_topic
#       → google_pubsub_subscription.audit_logs_bq_sub (BigQuery native)
#       → google_bigquery_dataset.audit_logs_dataset / google_bigquery_table.audit_logs_events
#
# Pipeline B — Application Observability Logs:
#   NestJS stdout (pino JSON)
#   → Cloud Run log agent → Cloud Logging
#   → google_logging_project_bucket_config.app_logs_bucket
#   → google_logging_linked_dataset.app_logs_bq_link (queryable via BigQuery SQL)

# ─── Pipeline A: BigQuery Dataset & Table ─────────────────────────────────────

resource "google_bigquery_dataset" "audit_logs_dataset" {
  dataset_id  = "audit_logs_dataset"
  description = "Dataset for storing application audit logs"
  location    = var.region
  project     = var.project_id
}

resource "google_bigquery_table" "audit_logs_events" {
  dataset_id = google_bigquery_dataset.audit_logs_dataset.dataset_id
  table_id   = "events"
  project    = var.project_id

  # Controlled per environment: false in non-prod (easy recreation), true in prod (data safety)
  deletion_protection = var.bigquery_deletion_protection

  schema = <<EOF
[
  { "name": "data",              "type": "JSON",      "mode": "NULLABLE" },
  { "name": "subscription_name", "type": "STRING",    "mode": "NULLABLE" },
  { "name": "message_id",        "type": "STRING",    "mode": "NULLABLE" },
  { "name": "publish_time",      "type": "TIMESTAMP", "mode": "NULLABLE" },
  { "name": "attributes",        "type": "JSON",      "mode": "NULLABLE" }
]
EOF
}

# ─── Pipeline A: Audit Logs Pub/Sub Topic ─────────────────────────────────────

resource "google_pubsub_topic" "audit_logs_topic" {
  name    = "audit-logs-topic"
  project = var.project_id

  message_storage_policy {
    allowed_persistence_regions = [var.region]
  }

  depends_on = [google_project_service.required_apis]
}

# ─── Pipeline A: IAM — Allow Pub/Sub to stream into BigQuery ──────────────────

resource "google_project_iam_member" "pubsub_bq_writer" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# ─── Pipeline A: BigQuery Native Subscription ─────────────────────────────────

resource "google_pubsub_subscription" "audit_logs_bq_sub" {
  name    = "audit-logs-bq-sub"
  topic   = google_pubsub_topic.audit_logs_topic.id
  project = var.project_id

  bigquery_config {
    table               = "${var.project_id}.${google_bigquery_dataset.audit_logs_dataset.dataset_id}.${google_bigquery_table.audit_logs_events.table_id}"
    write_metadata      = true
    drop_unknown_fields = false
  }

  depends_on = [google_project_iam_member.pubsub_bq_writer]
}

# ─── Pipeline B: Cloud Logging Bucket ─────────────────────────────────────────

resource "google_logging_project_bucket_config" "app_logs_bucket" {
  project          = var.project_id
  location         = var.region
  bucket_id        = "breathaway-app-logs"
  description      = "Application observability log bucket for structured Pino logs"
  retention_days   = 90
  enable_analytics = true
}

# ─── Pipeline B: Log Sink ─────────────────────────────────────────────────────

# Note: `unique_writer_identity` is intentionally omitted. For log sinks whose
# destination is a log bucket in the SAME project, GCP automatically uses the
# project's Cloud Logging service agent — no explicit IAM grant required.
# Setting unique_writer_identity = true for same-project bucket destinations
# produces an empty writer_identity, causing IAM bindings to fail.
resource "google_logging_project_sink" "app_logs_sink" {
  project     = var.project_id
  name        = "breathaway-app-log-sink"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.app_logs_bucket.id}"
  description = "Routes Breathaway API application logs to the observability log bucket"

  # var.app_log_name must match the APP_NAME env var set on the Cloud Run service
  # in scripts/common.<env>.sh exactly (current value: "BreathAway")
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.serviceContext.service=\"${var.app_log_name}\""

  depends_on = [google_logging_project_bucket_config.app_logs_bucket]
}

# ─── Pipeline B: BigQuery Linked Dataset ──────────────────────────────────────

# Links the Log Bucket to BigQuery so logs can be queried with SQL.
# Example query:
#   SELECT timestamp, jsonPayload.event, jsonPayload.requestId
#   FROM `breathaway-dev.app_logs_bq_link._AllLogs`
#   WHERE jsonPayload.requestId = 'req-abc123'
#   ORDER BY timestamp ASC
resource "google_logging_linked_dataset" "app_logs_bq_link" {
  link_id     = "app_logs_bq_link"
  bucket      = google_logging_project_bucket_config.app_logs_bucket.id
  parent      = "projects/${var.project_id}"
  location    = var.region
  description = "BigQuery linked dataset for querying Breathaway application logs"

  depends_on = [
    google_logging_project_bucket_config.app_logs_bucket,
    google_logging_project_sink.app_logs_sink,
  ]
}
