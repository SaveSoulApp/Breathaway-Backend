# audit-logs.tf
#
# Observability and audit logging: BigQuery streaming, Cloud Logging bucket, and BigQuery linked dataset.

# 1. BigQuery Dataset
resource "google_bigquery_dataset" "audit_logs_dataset" {
  dataset_id                 = "audit_logs_dataset"
  description                = "Dataset for storing application audit logs"
  location                   = var.region
  delete_contents_on_destroy = false
  project                    = var.project_id
}

# 2. BigQuery Table
resource "google_bigquery_table" "audit_logs_events" {
  dataset_id = google_bigquery_dataset.audit_logs_dataset.dataset_id
  table_id   = "events"
  project    = var.project_id

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

  # Security Hardening: Enforce deletion protection to prevent accidental data loss of compliance audit trails (SOC 2 CC7.2 / GDPR Art. 5)
  deletion_protection = true
}

# 3. Pub/Sub Topic
resource "google_pubsub_topic" "audit_logs_topic" {
  name    = "audit-logs-topic"
  project = var.project_id

  message_storage_policy {
    allowed_persistence_regions = [var.region]
  }
}

# 4. Fetch the project details dynamically for the service account
data "google_project" "project" {
  project_id = var.project_id
}

# 5. IAM Permission: Allow Pub/Sub internal agent to write to BigQuery
resource "google_project_iam_member" "pubsub_bq_writer" {
  project = data.google_project.project.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# 6. Pub/Sub Subscription (BigQuery Native Streaming)
resource "google_pubsub_subscription" "audit_logs_bq_sub" {
  name    = "audit-logs-bq-sub"
  topic   = google_pubsub_topic.audit_logs_topic.name
  project = var.project_id

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

# 7. Cloud Logging Log Bucket
resource "google_logging_project_bucket_config" "app_logs_bucket" {
  project          = data.google_project.project.project_id
  location         = var.region
  bucket_id        = "breathaway-app-logs"
  description      = "Application observability log bucket for structured Pino logs"
  retention_days   = 90
  enable_analytics = true
}

# 8. Log Sink — routes structured application logs to the Log Bucket
resource "google_logging_project_sink" "app_logs_sink" {
  project     = data.google_project.project.project_id
  name        = "breathaway-app-log-sink"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.app_logs_bucket.id}"
  description = "Routes Breathaway API application logs to the observability log bucket"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.serviceContext.service=\"BreathAway\""

  depends_on = [google_logging_project_bucket_config.app_logs_bucket]
}

# 9. BigQuery Linked Dataset from Log Bucket
resource "google_logging_linked_dataset" "app_logs_bq_link" {
  link_id     = "app_logs_bq_link"
  bucket      = google_logging_project_bucket_config.app_logs_bucket.id
  parent      = "projects/${data.google_project.project.project_id}"
  location    = var.region
  description = "BigQuery linked dataset for querying Breathaway application logs"

  depends_on = [
    google_logging_project_bucket_config.app_logs_bucket,
    google_logging_project_sink.app_logs_sink,
  ]
}
