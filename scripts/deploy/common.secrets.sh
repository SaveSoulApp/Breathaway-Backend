#!/bin/bash
# ==============================================================================
# Centralized Secret Manager Secret Names & Cloud Run Mappings
#
# Serves as the single source of truth for secret identifiers across deployment scripts.
# Categorized by section to match GCP Secret Manager metadata labels.
# ==============================================================================

# ==============================================================================
# Canonical GCP Secret Manager Secret Identifiers (Enum-like definitions)
# ==============================================================================

# --- Integrations ---
export SECRET_INSTAGRAM_ACCESS_TOKEN="access-token-instagram"
export SECRET_IPINFO_TOKEN="ipinfo-token"
export SECRET_META_APP_SECRET="meta-app-secret"

# --- Authentication & Client Security ---
export SECRET_API_KEYS="api-keys"
export SECRET_CLIENT_IDS="client-ids"
export SECRET_FIREBASE_CLIENT_EMAIL="firebase-client-email"
export SECRET_FIREBASE_PRIVATE_KEY="firebase-private-key"
export SECRET_JWT_SECRET="jwt-secret"

# --- Database & Storage ---
export SECRET_DATABASE_URL="database-url"
export SECRET_REDIS_URL="redis-url"

# --- Cryptography & KMS ---
export SECRET_ACTIVE_MASTER_KEY_ID="active-master-key-id"
export SECRET_GCP_SECRET_MASTER_KEYS="gcp-secret-master-keys"
export SECRET_HMAC_KEY_BASE64="hmac-key-base64"
export SECRET_KMS_ACTIVE_KEY_ID="kms-active-key-id"
export SECRET_KMS_KEY_NAMES="kms-key-names"

# --- Chat & Supabase ---
export SECRET_ACTIVE_CHAT_MASTER_KEY_ID="active-chat-master-key-id"
export SECRET_GCP_SECRET_CHAT_MASTER_KEYS="gcp-secret-chat-master-keys"
export SECRET_SUPABASE_JWT_PRIVATE_KEY="supabase-jwt-private-key"
export SECRET_SUPABASE_SERVICE_ROLE_KEY="supabase-service-role-key"
export SECRET_SUPABASE_URL="supabase-url"

# --- Payments & Subscriptions ---
export SECRET_CASHFREE_APP_ID="cashfree-app-id"
export SECRET_CASHFREE_SECRET_KEY="cashfree-secret-key"
export SECRET_RAZORPAY_KEY_ID="razorpay-key-id"
export SECRET_RAZORPAY_KEY_SECRET="razorpay-key-secret"
export SECRET_RAZORPAY_WEBHOOK_SECRET="razorpay-webhook-secret"
export SECRET_REVENUECAT_WEBHOOK_SECRET="revenuecat-webhook-secret"

# --- Notifications ---
export SECRET_BREVO_API_KEY="brevo-api-key"
export SECRET_LITEAPP_WHATSAPP_KEY="liteapp-whatsapp-key"

# --- API Documentation ---
export SECRET_SWAGGER_PASSWORD="swagger-password"
export SECRET_SWAGGER_USERNAME="swagger-username"

# ==============================================================================
# Cloud Run Secret Mappings (<ENV_VAR_NAME>=<SECRET_NAME>:latest)
# ==============================================================================

COMMON_SECRETS=(
    # --- Integrations ---
    "INSTAGRAM_ACCESS_TOKEN=${SECRET_INSTAGRAM_ACCESS_TOKEN}:latest"
    "IPINFO_TOKEN=${SECRET_IPINFO_TOKEN}:latest"
    "META_APP_SECRET=${SECRET_META_APP_SECRET}:latest"

    # --- Authentication & Client Security ---
    "API_KEYS=${SECRET_API_KEYS}:latest"
    "CLIENT_IDS=${SECRET_CLIENT_IDS}:latest"
    "FIREBASE_CLIENT_EMAIL=${SECRET_FIREBASE_CLIENT_EMAIL}:latest"
    "FIREBASE_PRIVATE_KEY=${SECRET_FIREBASE_PRIVATE_KEY}:latest"
    "JWT_SECRET=${SECRET_JWT_SECRET}:latest"

    # --- Database & Storage ---
    "DATABASE_URL=${SECRET_DATABASE_URL}:latest"
    "REDIS_URL=${SECRET_REDIS_URL}:latest"

    # --- Cryptography & KMS ---
    "ACTIVE_MASTER_KEY_ID=${SECRET_ACTIVE_MASTER_KEY_ID}:latest"
    "GCP_SECRET_MASTER_KEYS=${SECRET_GCP_SECRET_MASTER_KEYS}:latest"
    "HMAC_KEY_BASE64=${SECRET_HMAC_KEY_BASE64}:latest"
    "KMS_ACTIVE_KEY_ID=${SECRET_KMS_ACTIVE_KEY_ID}:latest"
    "KMS_KEY_NAMES=${SECRET_KMS_KEY_NAMES}:latest"

    # --- Chat & Supabase ---
    "ACTIVE_CHAT_MASTER_KEY_ID=${SECRET_ACTIVE_CHAT_MASTER_KEY_ID}:latest"
    "GCP_SECRET_CHAT_MASTER_KEYS=${SECRET_GCP_SECRET_CHAT_MASTER_KEYS}:latest"
    "SUPABASE_JWT_PRIVATE_KEY=${SECRET_SUPABASE_JWT_PRIVATE_KEY}:latest"
    "SUPABASE_SERVICE_ROLE_KEY=${SECRET_SUPABASE_SERVICE_ROLE_KEY}:latest"
    "SUPABASE_URL=${SECRET_SUPABASE_URL}:latest"

    # --- Payments & Subscriptions ---
    "CASHFREE_APP_ID=${SECRET_CASHFREE_APP_ID}:latest"
    "CASHFREE_SECRET_KEY=${SECRET_CASHFREE_SECRET_KEY}:latest"
    "RAZORPAY_KEY_ID=${SECRET_RAZORPAY_KEY_ID}:latest"
    "RAZORPAY_KEY_SECRET=${SECRET_RAZORPAY_KEY_SECRET}:latest"
    "RAZORPAY_WEBHOOK_SECRET=${SECRET_RAZORPAY_WEBHOOK_SECRET}:latest"
    "REVENUECAT_WEBHOOK_SECRET=${SECRET_REVENUECAT_WEBHOOK_SECRET}:latest"

    # --- Notifications ---
    "BREVO_API_KEY=${SECRET_BREVO_API_KEY}:latest"
    "LITEAPP_WHATSAPP_KEY=${SECRET_LITEAPP_WHATSAPP_KEY}:latest"

    # --- API Documentation ---
    "SWAGGER_PASSWORD=${SECRET_SWAGGER_PASSWORD}:latest"
    "SWAGGER_USERNAME=${SECRET_SWAGGER_USERNAME}:latest"
)
