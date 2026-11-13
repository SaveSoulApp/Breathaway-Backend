import Joi from 'joi';

/**
 * Validation options for Joi environment schema.
 * - allowUnknown: true ensures environment variables not explicitly defined in the schema
 *   (e.g., dynamic credentials, system runtime variables) are preserved and not rejected.
 * - abortEarly: false collects and reports all validation errors at startup rather than stopping at the first failure.
 */
export const envValidationOptions: Joi.ValidationOptions = {
  allowUnknown: true,
  abortEarly: false,
};

/**
 * Joi schema for validating application environment variables at startup.
 * Enforces strict typing, value coercion, enum checking, and serverless-resilient defaults
 * across core runtime settings, database pools, authentication, and external services.
 *
 * Categorized in alignment with deployment layers:
 * scripts/deploy/common.base.sh, common.dev.sh, common.prod.sh, and common.secrets.sh.
 */
export const envValidationSchema = Joi.object({
  // ============================================================================
  // 1. Core Environment & Server Runtime
  // ============================================================================
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DEPLOYMENT_ENV: Joi.string()
    .valid('gcp', 'local', 'development', 'production')
    .default('gcp'),
  APP_NAME: Joi.string().default('BreathAway'),
  APP_URL: Joi.string().uri().default('https://www.breathaway.app'),
  APP_VERSION: Joi.string().default('1.0.0'),
  MIN_APP_VERSION: Joi.string().default('1.0.0'),
  REQUIRED_PLATFORMS: Joi.string().default('["ios","android","web","postman"]'),
  CORS_ORIGINS: Joi.string().default(
    '["http://localhost:3000","http://localhost:5173"]',
  ),
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('true'),

  // ============================================================================
  // 2. Database & Connection Pool Management (Cloud SQL PostgreSQL)
  // ============================================================================
  DATABASE_URL: Joi.string().required(),
  DB_POOL_MAX: Joi.number().integer().min(1).max(50).default(4),
  DB_POOL_MIN: Joi.number().integer().min(0).default(0),
  DB_POOL_ACQUISITION_TIMEOUT_MS: Joi.number().integer().min(100).default(5000),
  DB_POOL_IDLE_TIMEOUT_MS: Joi.number().integer().min(0).default(10000),
  DB_POOL_STATEMENT_TIMEOUT_MS: Joi.number().integer().min(0).default(15000),
  DB_SLOW_QUERY_THRESHOLD_MS: Joi.number().integer().min(1).default(200),
  DB_LOG_ALL_QUERIES: Joi.boolean().default(false),

  // ============================================================================
  // 3. Redis Cache & Distributed Throttling
  // ============================================================================
  REDIS_URL: Joi.string().optional(),
  REDIS_CONNECT_TIMEOUT_MS: Joi.number().integer().positive().default(5000),
  REDIS_COMMAND_TIMEOUT_MS: Joi.number().integer().positive().default(3000),
  IS_THROTTLING_ENABLED_VIA_REDIS: Joi.boolean().default(true),
  THROTTLING_REDIS_ENABLED: Joi.boolean().optional(),

  // ============================================================================
  // 4. Authentication & Client Security
  // ============================================================================
  API_KEYS: Joi.string().optional(),
  CLIENT_IDS: Joi.string().optional(),
  JWT_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('14d'),
  JWT_AUDIENCE: Joi.string().default('breathaway-mobile-app'),
  JWT_ISSUER: Joi.string().default('https://breathaway.app'),
  JWT_CACHE_ENABLED: Joi.boolean().default(true),
  JWT_CACHE_TTL_SECONDS: Joi.number().integer().positive().default(300),
  OTP_TTL: Joi.number().integer().positive().default(300),
  OTP_RATE_LIMIT_TTL: Joi.number().integer().positive().default(120),
  FIREBASE_PROJECT_ID: Joi.string().default('breathaway-development'),
  FIREBASE_CLIENT_EMAIL: Joi.string().optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().optional(),

  // ============================================================================
  // 5. Cryptography & KMS (Envelope Encryption & HMAC)
  // ============================================================================
  ACTIVE_MASTER_KEY_ID: Joi.string().optional(),
  GCP_SECRET_MASTER_KEYS: Joi.string().optional(),
  HMAC_KEY_BASE64: Joi.string().optional(),
  KMS_ACTIVE_KEY_ID: Joi.string().optional(),
  KMS_KEY_NAMES: Joi.string().optional(),
  USE_GOOGLE_CLOUD_KMS: Joi.boolean().optional(),

  // ============================================================================
  // 6. Chat & Supabase Realtime
  // ============================================================================
  ACTIVE_CHAT_MASTER_KEY_ID: Joi.string().optional(),
  GCP_SECRET_CHAT_MASTER_KEYS: Joi.string().optional(),
  SUPABASE_URL: Joi.string().uri().optional(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().optional(),
  SUPABASE_JWT_PRIVATE_KEY: Joi.string().optional(),
  SUPABASE_JWT_KEY_ID: Joi.string().optional(),

  // ============================================================================
  // 7. Payments & Subscriptions (Gateways & In-App Purchases)
  // ============================================================================
  RAZORPAY_KEY_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  RAZORPAY_KEY_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  CASHFREE_APP_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  CASHFREE_SECRET_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  REVENUECAT_WEBHOOK_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  DEFAULT_COUNTRY_CODE: Joi.string().length(2).uppercase().default('IN'),
  APPLE_BUNDLE_ID: Joi.string().default('com.breathaway.app'),
  APPLE_ROOT_CA_PEM: Joi.string().optional(),
  GOOGLE_PACKAGE_NAME: Joi.string().optional(),

  // ============================================================================
  // 8. Notifications (Email, WhatsApp, WebPush)
  // ============================================================================
  EMAIL_PROVIDER: Joi.string()
    .valid('mailgun', 'sendgrid', 'brevo', 'resend')
    .default('brevo'),
  EMAIL_FROM_ADDRESS: Joi.string().email().default('no-reply@breathaway.app'),
  EMAIL_FROM_NAME: Joi.string().default('BreathAway'),
  BREVO_API_KEY: Joi.string().optional(),
  RESEND_API_KEY: Joi.string().optional(),
  MAILGUN_API_KEY: Joi.string().optional(),
  MAILGUN_DOMAIN: Joi.string().optional(),
  MAILGUN_HOST: Joi.string().optional(),
  SENDGRID_API_KEY: Joi.string().optional(),
  WHATSAPP_PROVIDER: Joi.string().valid('liteapp', 'meta').default('liteapp'),
  LITEAPP_WHATSAPP_URL: Joi.string().uri().default('https://www.liteapp.store'),
  LITEAPP_WHATSAPP_KEY: Joi.string().optional(),
  WHATSAPP_LIKE_NOTIFICATION_ENABLED: Joi.boolean().default(false),
  WHATSAPP_LIKE_NOTIFICATION_BUFFER_DAYS: Joi.number()
    .integer()
    .min(1)
    .default(7),
  WHATSAPP_LIKE_ALLOWED_COUNTRY_CODES: Joi.string().default('["+91"]'),
  WEBPUSH_ICON_URL: Joi.string().uri().empty('').optional(),
  WEBPUSH_BADGE_URL: Joi.string().uri().empty('').optional(),
  EMAIL_LOGO_URL: Joi.string().uri().empty('').optional(),

  // ============================================================================
  // 9. Observability, Logging & Cloud Pub/Sub
  // ============================================================================
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
  SHOULD_LOG_RESPONSE: Joi.boolean().default(false),
  AUDIT_PUBSUB_TOPIC: Joi.string().default('audit-logs-topic'),
  AUDIT_BIGQUERY_DATASET: Joi.string().default('audit_logs_dataset'),
  AUDIT_BIGQUERY_TABLE: Joi.string().default('events'),
  PUBSUB_NOTIFICATIONS_TOPIC: Joi.string().optional(),

  // ============================================================================
  // 10. GCP Infrastructure & Cloud Run
  // ============================================================================
  GCP_PROJECT_ID: Joi.string().default('breathaway-development'),
  GCP_BUCKET_NAME: Joi.string().default('breathaway-documents'),
  GCP_OIDC_AUDIENCE: Joi.string().optional(),
  GCP_ADMIN_OIDC_AUDIENCE: Joi.string().optional(),
  GCP_ADMIN_IAM_ROLES: Joi.string().optional(),

  // ============================================================================
  // 11. Integrations & External Webhooks
  // ============================================================================
  INSTAGRAM_ACCESS_TOKEN: Joi.string().optional(),
  INSTAGRAM_GRAPH_API_VERSION: Joi.string().default('v21.0'),
  IPINFO_TOKEN: Joi.string().optional(),
  IPINFO_TIMEOUT_MS: Joi.number().integer().min(100).default(1500),
  META_VERIFY_TOKEN: Joi.string().optional(),
  META_APP_SECRET: Joi.string().optional(),

  // ============================================================================
  // 12. Business Policies, Expirations & Batch Retention
  // ============================================================================
  CREDIT_EXPIRY_DAYS: Joi.number().integer().positive().default(90),
  CREDIT_EXPIRY_BATCH_SIZE: Joi.number().integer().positive().default(500),
  LIKE_EXPIRY_DAYS: Joi.number().integer().positive().default(90),
  USER_SESSION_RETENTION_DAYS: Joi.number().integer().positive().default(30),
  USER_SESSION_CLEANUP_BATCH_SIZE: Joi.number()
    .integer()
    .positive()
    .default(500),
  DSAR_EXPORT_BUCKET_NAME: Joi.string().optional(),
  DSAR_EXPORT_RETENTION_DAYS: Joi.number().integer().min(1).max(30).default(7),
  DSAR_SIGNED_URL_TTL_MINUTES: Joi.number()
    .integer()
    .min(5)
    .max(1440)
    .default(60),
  DSAR_EXPORT_COOLDOWN_HOURS: Joi.number().integer().min(1).max(72).default(24),

  // ============================================================================
  // 13. API Documentation & Admin Access
  // ============================================================================
  SWAGGER_USERNAME: Joi.string().optional(),
  SWAGGER_PASSWORD: Joi.string().optional(),
});
