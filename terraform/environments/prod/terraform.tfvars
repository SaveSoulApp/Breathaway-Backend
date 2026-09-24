# Production environment configuration
# Safe to commit — no secret values are stored here.
#
# IMPORTANT: Before running terraform for this environment:
#   1. Deploy the Cloud Run service first (deploy.sh --env=prod)
#      Terraform needs the Cloud Run service URL for Pub/Sub subscriptions and Cloud Scheduler.
#   2. Ensure the runtime service account exists:
#      api-runtime@breathaway.iam.gserviceaccount.com
#      with roles: secretmanager.secretAccessor (per-secret), pubsub.publisher,
#      bigquery.dataEditor

project_id                   = "breathaway"
region                       = "asia-south1"
environment                  = "prod"
service_name                 = "backend-service"
github_repo                  = "SaveSoulApp/Breathaway-Backend"
app_log_name                 = "BreathAway"
bigquery_deletion_protection = true
