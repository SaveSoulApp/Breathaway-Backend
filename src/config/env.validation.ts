import Joi from 'joi';

/**
 * Validation options for Joi environment schema.
 * - allowUnknown: true ensures environment variables not explicitly defined in the schema
 *   (e.g., GCP Secret Manager secrets, dynamic credentials) are preserved and not rejected.
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
 */
export const envValidationSchema = Joi.object({
  // Core Environment & Server
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DEPLOYMENT_ENV: Joi.string()
    .valid('gcp', 'local', 'development', 'production')
    .default('gcp'),
  APP_NAME: Joi.string().default('BreathAway'),
  MIN_APP_VERSION: Joi.string().default('1.0.0'),
  REQUIRED_PLATFORMS: Joi.string().default('["iOS","Android","Postman","Web"]'),
  CORS_ORIGINS: Joi.string().default(
    '["http://localhost:3000","http://localhost:5173"]',
  ),

  // Database Connection & Pool Management (Serverless Cloud Run)
  DATABASE_URL: Joi.string().required(),
  DB_POOL_MAX: Joi.number().integer().min(1).max(50).default(4),
  DB_POOL_MIN: Joi.number().integer().min(0).default(0),
  DB_POOL_ACQUISITION_TIMEOUT_MS: Joi.number().integer().min(100).default(5000),
  DB_POOL_IDLE_TIMEOUT_MS: Joi.number().integer().min(0).default(10000),
  DB_POOL_STATEMENT_TIMEOUT_MS: Joi.number().integer().min(0).default(15000),

  // Observability & Logging
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  // GCP & Infrastructure
  GCP_PROJECT_ID: Joi.string().default('breathaway-dev'),
  GCP_BUCKET_NAME: Joi.string().default('breathaway-documents'),
  GCP_OIDC_AUDIENCE: Joi.string().uri().optional(),
  FIREBASE_PROJECT_ID: Joi.string().default('breathaway-dev-37fd5'),
  AUDIT_PUBSUB_TOPIC: Joi.string().default('audit-logs-topic'),
  META_VERIFY_TOKEN: Joi.string().optional(),

  // Authentication & Security
  JWT_EXPIRES_IN: Joi.string().default('30d'),
  JWT_AUDIENCE: Joi.string().default('breathaway-mobile-app'),
  JWT_ISSUER: Joi.string().default('https://breathaway.app'),
  OTP_TTL: Joi.number().integer().positive().default(300),
  OTP_RATE_LIMIT_TTL: Joi.number().integer().positive().default(120),
  SUPABASE_JWT_KEY_ID: Joi.string().optional(),

  // Business Domain Numeric Expirations
  CREDIT_EXPIRY_DAYS: Joi.number().integer().positive().default(90),
  LIKE_EXPIRY_DAYS: Joi.number().integer().positive().default(90),

  // Subscriptions & Regional Pricing Defaults
  DEFAULT_COUNTRY_CODE: Joi.string().length(2).uppercase().default('IN'),
  IPINFO_TOKEN: Joi.string().optional(),
  IPINFO_TIMEOUT_MS: Joi.number().integer().min(100).default(1500),

  // Email Notifications Provider & Credentials
  EMAIL_PROVIDER: Joi.string()
    .valid('mailgun', 'sendgrid', 'brevo')
    .default('brevo'),
  EMAIL_FROM_ADDRESS: Joi.string().email().default('no-reply@breathaway.com'),
  EMAIL_FROM_NAME: Joi.string().default('BreathAway'),
  MAILGUN_API_KEY: Joi.string().optional(),
  MAILGUN_DOMAIN: Joi.string().optional(),
  SENDGRID_API_KEY: Joi.string().optional(),

  // Swagger Documentation Access Control
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('true'),
});
