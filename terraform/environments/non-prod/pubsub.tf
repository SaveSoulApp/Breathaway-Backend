# pubsub.tf
#
# GCP Pub/Sub topics and push subscriptions with OIDC authentication.
#
# Architecture:
#   Topic → Push Subscription (OIDC token) → Cloud Run /api/v1/pubsub/ingest
#
# Security: Pub/Sub delivers messages using a short-lived OIDC ID token in the
# Authorization header rather than a plaintext query param — eliminating token
# leakage in Cloud Run access logs (httpRequest.requestUrl).

locals {
  pubsub_push_subscriptions = {
    credit_expiry = {
      topic_name        = "credit-expiry"
      subscription_name = "credit-expiry-push-sub"
      ack_deadline      = 60
    }
    identity_workflows = {
      topic_name        = "identity-workflows"
      subscription_name = "identity-workflows-push-sub"
      ack_deadline      = 60
    }
    notifications_stream = {
      topic_name        = "notifications-stream"
      subscription_name = "notifications-stream-push-sub"
      ack_deadline      = 60
    }
    meta_webhooks = {
      topic_name        = "meta-webhooks"
      subscription_name = "meta-webhooks-push-sub"
      ack_deadline      = 60
    }
  }
}

# ─── Pub/Sub Topics ───────────────────────────────────────────────────────────

resource "google_pubsub_topic" "app_topics" {
  for_each = { for k, v in local.pubsub_push_subscriptions : k => v.topic_name }

  name    = each.value
  project = var.project_id

  message_storage_policy {
    allowed_persistence_regions = [var.region]
  }

  depends_on = [google_project_service.required_apis]
}

# ─── Pub/Sub Push Subscription Service Account ────────────────────────────────

# Dedicated SA used exclusively for Pub/Sub push subscription delivery
resource "google_service_account" "pubsub_invoker" {
  account_id   = "pubsub-invoker"
  display_name = "PubSub Push Subscription Invoker"
  project      = var.project_id
}

# Allow the GCP Pub/Sub internal service agent to mint OIDC tokens on behalf
# of the pubsub-invoker SA (required for authenticated push delivery)
resource "google_service_account_iam_member" "pubsub_token_creator" {
  service_account_id = google_service_account.pubsub_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# Allow the pubsub-invoker SA to invoke the Cloud Run service (required for push delivery)
resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker_run_binding" {
  name     = data.google_cloud_run_v2_service.backend_service.name
  location = data.google_cloud_run_v2_service.backend_service.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_invoker.email}"
}

# ─── Push Subscriptions ───────────────────────────────────────────────────────

resource "google_pubsub_subscription" "push_subscriptions" {
  for_each = local.pubsub_push_subscriptions

  name    = each.value.subscription_name
  topic   = google_pubsub_topic.app_topics[each.key].id
  project = var.project_id

  ack_deadline_seconds = each.value.ack_deadline

  push_config {
    push_endpoint = "${data.google_cloud_run_v2_service.backend_service.uri}/api/v1/pubsub/ingest"

    oidc_token {
      service_account_email = google_service_account.pubsub_invoker.email
      audience              = data.google_cloud_run_v2_service.backend_service.uri
    }
  }

  depends_on = [
    google_service_account_iam_member.pubsub_token_creator,
    google_cloud_run_v2_service_iam_member.pubsub_invoker_run_binding,
  ]
}
