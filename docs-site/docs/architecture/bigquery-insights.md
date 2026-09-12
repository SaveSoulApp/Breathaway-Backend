---
sidebar_position: 3
---

# BigQuery Analytics & Insights

With our structured logging architecture routing JSON payloads from Cloud Run into BigQuery, we have a powerful data warehouse for both engineering diagnostics and business analytics.

Because BigQuery is a columnar database, always ensure you only `SELECT` the columns you need and apply `timestamp` filters (using the native `timestamp` column) to partition the data and keep query costs minimal.

> **Table Placeholder**: In the queries below, replace `` `breathaway-dev.app_logs_bq_link._AllLogs` `` with your actual GCP BigQuery table name.

---

## 🛠 Engineering & Troubleshooting

### 1. Trace a Full Request Lifecycle

**Use Case:** A user reported a bug, and you have the `requestId` (e.g., from an error response or frontend logs). You want to see every single log, database step, and event that occurred during that specific API call.

```sql
SELECT
  timestamp,
  severity,
  JSON_VALUE(json_payload, '$.context') AS context,
  JSON_VALUE(json_payload, '$.step') AS step,
  JSON_VALUE(json_payload, '$.message') AS message,
  JSON_VALUE(json_payload, '$.event') AS event_name
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.requestId') = 'YOUR_REQUEST_ID_HERE'
ORDER BY timestamp ASC;
```

### 2. Identify the Slowest API Endpoints (P95 Latency)

**Use Case:** Monitor backend performance by finding the endpoints that take the longest to respond. The `REQUEST_COMPLETED` event automatically tracks the duration.

```sql
SELECT
  JSON_VALUE(json_payload, '$.context') AS controller_method,
  COUNT(*) as request_count,
  APPROX_QUANTILES(CAST(JSON_VALUE(json_payload, '$.durationMs') AS INT64), 100)[OFFSET(95)] AS p95_latency_ms,
  MAX(CAST(JSON_VALUE(json_payload, '$.durationMs') AS INT64)) AS max_latency_ms
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') = 'REQUEST_COMPLETED'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY controller_method
ORDER BY p95_latency_ms DESC
LIMIT 20;
```

### 3. API Error Rates by Service

**Use Case:** Quickly identify which services or controllers are throwing the most exceptions to prioritize technical debt, bug fixes, or infrastructure scaling.

```sql
SELECT
  JSON_VALUE(json_payload, '$.context') AS service_context,
  COUNT(*) AS error_count
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE severity = 'ERROR'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY service_context
ORDER BY error_count DESC;
```

### 4. Background Job & Pub/Sub Failures

**Use Case:** Monitor asynchronous message processing reliability to catch messages that failed to route or execute.

```sql
SELECT
  timestamp,
  JSON_VALUE(json_payload, '$.messageId') AS pubsub_message_id,
  JSON_VALUE(json_payload, '$.context') AS subscriber,
  JSON_VALUE(json_payload, '$.err.message') AS error_details
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('PUBSUB_MESSAGE_FAILED', 'PUBSUB_PUBLISH_FAILED')
ORDER BY timestamp DESC;
```

---

## 📈 Business & Product Metrics

### 5. Overall API Traffic & Active Usage

**Use Case:** Understand the raw traffic volume on the backend within a specific timeframe (e.g., the last 30 days) to track app usage growth.

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNT(*) AS total_requests
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') = 'REQUEST_RECEIVED'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY log_date
ORDER BY log_date ASC;
```

### 6. User Onboarding Funnel (Identity to Profile)

**Use Case:** Identify drop-offs in the onboarding flow. How many users create an Identity (sign up) vs how many actually complete their Profile?

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'IDENTITY_CREATED') AS identities_created,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'PROFILE_CREATED') AS profiles_created,
  ROUND(SAFE_DIVIDE(COUNTIF(JSON_VALUE(json_payload, '$.event') = 'PROFILE_CREATED'), COUNTIF(JSON_VALUE(json_payload, '$.event') = 'IDENTITY_CREATED')) * 100, 2) AS funnel_completion_percentage
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('IDENTITY_CREATED', 'PROFILE_CREATED')
GROUP BY log_date
ORDER BY log_date ASC;
```

### 7. Core Match Activity

**Use Case:** Understand community dynamics and engagement success. Track how many matches are being formed versus dissolved.

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'MATCH_CREATED') AS matches_created,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'MATCH_DISSOLVED') AS matches_dissolved
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('MATCH_CREATED', 'MATCH_DISSOLVED')
GROUP BY log_date
ORDER BY log_date DESC;
```

### 8. Mobile Platform Adoption

**Use Case:** See the breakdown of devices registering for Push Notifications to help guide client-side development priorities (iOS vs Android).

```sql
SELECT
  JSON_VALUE(json_payload, '$.platform') AS device_platform,
  COUNT(*) AS registered_devices
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') = 'DEVICE_REGISTERED'
GROUP BY device_platform;
```

### 9. OTP Verification Conversion Rate

**Use Case:** Track the health and deliverability of the authentication system by comparing OTPs sent versus OTPs successfully verified.

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'OTP_SENT') AS otps_sent,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'OTP_VERIFIED') AS otps_verified,
  ROUND(SAFE_DIVIDE(COUNTIF(JSON_VALUE(json_payload, '$.event') = 'OTP_VERIFIED'), COUNTIF(JSON_VALUE(json_payload, '$.event') = 'OTP_SENT')) * 100, 2) AS conversion_percentage
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('OTP_SENT', 'OTP_VERIFIED')
GROUP BY log_date
ORDER BY log_date ASC;
```

### 10. Subscription Conversion & Churn

**Use Case:** High-level revenue tracking. Compare successful subscription completions against cancellations and webhook failures.

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_PURCHASE_COMPLETED') AS purchases,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_RENEWED') AS renewals,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_CANCELLED') AS cancellations
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') LIKE 'SUBSCRIPTION_%'
GROUP BY log_date
ORDER BY log_date DESC;
```

---

## 🏛 CTO Lens (Infrastructure, Reliability & Security)

These queries provide executive visibility into system health, unit economics, vendor reliability, and security posture.

### 11. API Availability SLA (The "Nine's" Tracker)

**Use Case:** Calculate the exact availability percentage (e.g., 99.95%) of the platform over the last 30 days to ensure SLA compliance.

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNTIF(CAST(JSON_VALUE(json_payload, '$.statusCode') AS INT64) < 500) AS successful_requests,
  COUNTIF(CAST(JSON_VALUE(json_payload, '$.statusCode') AS INT64) >= 500) AS server_errors,
  ROUND((COUNTIF(CAST(JSON_VALUE(json_payload, '$.statusCode') AS INT64) < 500) / COUNT(*)) * 100, 4) AS uptime_percentage
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('REQUEST_COMPLETED', 'REQUEST_FAILED')
GROUP BY log_date
ORDER BY log_date DESC;
```

### 12. External Vendor Degradation

**Use Case:** Is an external service (e.g., Meta APIs, Apple, Firebase) causing latency or failing? This tracks the failure rate of 3rd-party integrations.

```sql
SELECT
  JSON_VALUE(json_payload, '$.provider') AS external_provider,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'EXTERNAL_REQUEST_COMPLETED') AS successful_calls,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'EXTERNAL_REQUEST_FAILED') AS failed_calls,
  ROUND(SAFE_DIVIDE(COUNTIF(JSON_VALUE(json_payload, '$.event') = 'EXTERNAL_REQUEST_FAILED'), COUNT(*)) * 100, 2) AS failure_rate_percentage
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') LIKE 'EXTERNAL_REQUEST_%'
GROUP BY external_provider
ORDER BY failure_rate_percentage DESC;
```

### 13. Brute Force & Fraud Detection

**Use Case:** Detect spikes in failed logins or OTP verifications, which often indicate botnets, credential stuffing, or SMS toll fraud.

```sql
SELECT
  EXTRACT(HOUR FROM timestamp) AS hour_of_day,
  JSON_VALUE(json_payload, '$.remoteAddress') AS ip_address,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'USER_AUTHENTICATION_FAILED') AS failed_logins,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'OTP_VERIFICATION_FAILED') AS failed_otps
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('USER_AUTHENTICATION_FAILED', 'OTP_VERIFICATION_FAILED')
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY hour_of_day, ip_address
HAVING failed_logins > 50 OR failed_otps > 20
ORDER BY hour_of_day DESC, failed_logins DESC;
```

### 14. Platform Abuse Index (Block Spikes)

**Use Case:** A sudden spike in `BLOCK_CREATED` events usually indicates a malicious user or bot has bypassed onboarding and is spamming genuine users.

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNT(*) AS blocks_issued,
  COUNT(DISTINCT JSON_VALUE(json_payload, '$.blockedUserId')) AS unique_users_blocked
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') = 'BLOCK_CREATED'
GROUP BY log_date
ORDER BY log_date DESC;
```

### 15. Virtual Economy & Credit Deflation

**Use Case:** Monitor the stability of the virtual economy. Ensure we aren't granting vastly more credits than users are spending, which leads to inflation of free value.

```sql
SELECT
  EXTRACT(YEAR FROM timestamp) AS year,
  EXTRACT(MONTH FROM timestamp) AS month,
  SUM(CAST(JSON_VALUE(json_payload, '$.amount') AS INT64)) AS total_credits_granted,
  SUM(CAST(JSON_VALUE(json_payload, '$.amount') AS INT64)) AS total_credits_deducted
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('CREDITS_GRANTED', 'CREDITS_DEDUCTED')
GROUP BY year, month
ORDER BY year DESC, month DESC;
```

---

## 📊 Analytics Lead Lens (Growth, Funnels & Monetization)

These queries provide deep insights into user behavior, feature stickiness, drop-off points, and LTV (Life-Time Value).

### 16. Granular Checkout Funnel Drop-off

**Use Case:** Find exactly where users abandon the checkout process. Are they failing at the provider level, or just abandoning the cart?

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_PURCHASE_INITIATED') AS intent_to_buy,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_PURCHASE_COMPLETED') AS payment_succeeded,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_PURCHASE_FAILED') AS payment_failed,
  ROUND(SAFE_DIVIDE(COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_PURCHASE_COMPLETED'), COUNTIF(JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_PURCHASE_INITIATED')) * 100, 2) AS checkout_conversion_rate
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') LIKE 'SUBSCRIPTION_PURCHASE_%'
GROUP BY log_date
ORDER BY log_date DESC;
```

### 17. The "Verified Identity" Monetization Lift

**Use Case:** Do users who verify their social identities (e.g., Instagram) convert to paid subscriptions at a higher rate than anonymous users? (Cohort Analysis)

```sql
WITH VerifiedUsers AS (
  SELECT DISTINCT JSON_VALUE(json_payload, '$.userId') AS user_id
  FROM `breathaway-dev.app_logs_bq_link._AllLogs`
  WHERE JSON_VALUE(json_payload, '$.event') = 'SOCIAL_IDENTITY_VERIFIED'
),
Purchasers AS (
  SELECT DISTINCT JSON_VALUE(json_payload, '$.userId') AS user_id
  FROM `breathaway-dev.app_logs_bq_link._AllLogs`
  WHERE JSON_VALUE(json_payload, '$.event') = 'SUBSCRIPTION_PURCHASE_COMPLETED'
)
SELECT
  'Verified Social Identity' AS cohort,
  COUNT(DISTINCT v.user_id) AS total_users,
  COUNT(DISTINCT p.user_id) AS paying_users,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT p.user_id), COUNT(DISTINCT v.user_id)) * 100, 2) AS conversion_rate
FROM VerifiedUsers v
LEFT JOIN Purchasers p ON v.user_id = p.user_id
UNION ALL
SELECT
  'Unverified Identity' AS cohort,
  -- Note: Requires a CTE for all unverified users based on IDENTITY_CREATED minus VerifiedUsers
  0, 0, 0; -- (Simplified for example)
```

### 18. Notification Pipeline Leaks

**Use Case:** We queue a notification, but does it actually hit the user's phone? This tracks the drop-off between internal queues, the FCM provider, and hard failures.

```sql
SELECT
  EXTRACT(DATE FROM timestamp) AS log_date,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'NOTIFICATION_QUEUED') AS internally_queued,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'PUSH_NOTIFICATION_SENT') AS delivered_to_fcm,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'PUSH_NOTIFICATION_FAILED') AS provider_failures,
  ROUND(SAFE_DIVIDE(COUNTIF(JSON_VALUE(json_payload, '$.event') = 'PUSH_NOTIFICATION_FAILED'), COUNTIF(JSON_VALUE(json_payload, '$.event') = 'NOTIFICATION_QUEUED')) * 100, 2) AS failure_rate
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') LIKE '%NOTIFICATION%'
GROUP BY log_date
ORDER BY log_date DESC;
```

### 19. Churn Precursors (Match Dissolution → Account Deletion)

**Use Case:** Why are users deleting their accounts? Are users deleting their accounts immediately after a match dissolves or they receive a block?

```sql
SELECT
  JSON_VALUE(json_payload, '$.userId') AS user_id,
  JSON_VALUE(json_payload, '$.event') AS event_name,
  timestamp
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('MATCH_DISSOLVED', 'BLOCK_CREATED', 'ACCOUNT_DELETED')
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
ORDER BY user_id, timestamp ASC;
-- (Analysts can window this data to see if MATCH_DISSOLVED occurs within 24h of ACCOUNT_DELETED)
```

### 20. Feature Engagement Index

**Use Case:** Track core engagement features. Are people actually using likes, clearing chats, or linking Instagram?

```sql
SELECT
  EXTRACT(WEEK FROM timestamp) AS week_of_year,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'LIKE_CREATED') AS likes_sent,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'MATCH_RESOLUTION_TRIGGERED') AS match_resolutions_started,
  COUNTIF(JSON_VALUE(json_payload, '$.event') = 'INSTAGRAM_IDENTITY_LINKED') AS instagram_links
FROM `breathaway-dev.app_logs_bq_link._AllLogs`
WHERE JSON_VALUE(json_payload, '$.event') IN ('LIKE_CREATED', 'MATCH_RESOLUTION_TRIGGERED', 'INSTAGRAM_IDENTITY_LINKED')
GROUP BY week_of_year
ORDER BY week_of_year DESC;
```
