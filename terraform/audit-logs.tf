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
