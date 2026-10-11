# secrets.tf
#
# Canonical list of application secrets managed in GCP Secret Manager.
# Serves as the single source of truth for Secret Manager secret identifiers within Terraform.

locals {
  # Map of canonical secret keys to their GCP Secret Manager secret IDs
  secret_names = {
    client_ids                = "client-ids"
    api_keys                  = "api-keys"
    jwt_secret                = "jwt-secret"
    instagram_access_token    = "access-token-instagram"
    database_url              = "database-url"
    redis_url                 = "redis-url"
    gcp_secret_master_keys    = "gcp-secret-master-keys"
    active_master_key_id      = "active-master-key-id"
    hmac_key_base64           = "hmac-key-base64"
    firebase_client_email     = "firebase-client-email"
    firebase_private_key      = "firebase-private-key"
    kms_key_names             = "kms-key-names"
    kms_active_key_id         = "kms-active-key-id"
    supabase_url              = "supabase-url"
    supabase_service_role_key = "supabase-service-role-key"
    supabase_jwt_private_key  = "supabase-jwt-private-key"
    swagger_username          = "swagger-username"
    swagger_password          = "swagger-password"
    revenuecat_webhook_secret = "revenuecat-webhook-secret"
    ipinfo_token              = "ipinfo-token"
    brevo_api_key             = "brevo-api-key"
    razorpay_key_id           = "razorpay-key-id"
    razorpay_key_secret       = "razorpay-key-secret"
    razorpay_webhook_secret   = "razorpay-webhook-secret"
    cashfree_app_id           = "cashfree-app-id"
    cashfree_secret_key       = "cashfree-secret-key"
    liteapp_whatsapp_key      = "liteapp-whatsapp-key"
  }

  # List of all secrets required by the backend service at runtime (mirrors COMMON_SECRETS)
  backend_common_secrets = values(local.secret_names)
}
