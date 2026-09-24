# pubsub.tf
#
# GCP Pub/Sub Push Subscriptions with Google Service Account OIDC Authentication.
#
# Eliminates plaintext secret token leakage in Cloud Run access logs (httpRequest.requestUrl)
# by switching from legacy "?token=..." query parameters to short-lived Google OIDC ID tokens
# passed in the "Authorization: Bearer <JWT>" header.
#
# Relies on variables (project_id, region, service_name) and data sources (backend_service, project)
# declared in scheduler.tf and audit-logs.tf.

locals {
  pubsub_push_endpoint = "${data.google_cloud_run_v2_service.backend_service.uri}/api/v1/pubsub/ingest"

  # Map of application Pub/Sub topics and their push subscriptions
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

# 1. Dedicated Service Account for Pub/Sub push subscription delivery
resource "google_service_account" "pubsub_invoker" {
  account_id   = "pubsub-invoker"
  display_name = "PubSub Push Subscription Invoker"
  project      = var.project_id
}

# 2. Allow GCP Pub/Sub service agent to mint OIDC tokens for the pubsub-invoker service account
resource "google_service_account_iam_member" "pubsub_token_creator" {
  service_account_id = google_service_account.pubsub_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# 3. Grant the service account permissions to invoke the Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker_run_binding" {
  name     = data.google_cloud_run_v2_service.backend_service.name
  location = data.google_cloud_run_v2_service.backend_service.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_invoker.email}"
}

# 4. Pub/Sub Push Subscriptions with OIDC Authentication
# Google Pub/Sub sends HTTP POST to /api/v1/pubsub/ingest with Authorization: Bearer <OIDC_TOKEN>
resource "google_pubsub_subscription" "push_subscriptions" {
  for_each = local.pubsub_push_subscriptions

  name    = each.value.subscription_name
  topic   = each.value.topic_name
  project = var.project_id

  ack_deadline_seconds = each.value.ack_deadline

  push_config {
    push_endpoint = local.pubsub_push_endpoint

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
