---
sidebar_position: 19
---

# Subscriptions Module

The `SubscriptionsModule` manages billing, user subscription plan states (Apple App Store, Google Play Store), and plan details.

---

## 📋 Purpose & Responsibilities

- **Subscription Plans (`GET /plans`)**: Serves active plans details (prices, validities, trial periods, and granted credits).
- **Subscription Verification**: Integrates with external payment processors (e.g. RevenueCat or direct App Store verification endpoints) to validate transaction credentials.
- **Credit Grants**: Automatically issues credits to a user's ledger when their subscription renews.
- **State Auditing**: Logs subscription events (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRY`) in the `SubscriptionEvent` table.

---

## 🛠 File & Class Definitions

### Controllers
- **[SubscriptionsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/subscriptions/subscriptions.controller.ts)**: Handles plan listing and active status retrieval.
  - Route Prefix: `/api/v1/subscriptions`
- **[SubscriptionsWebhookController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/subscriptions/subscriptions-webhook.controller.ts)**: Ingests billing notifications from payment providers.

### Service
- **[SubscriptionsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/subscriptions/subscriptions.service.ts)**: Validates plan status, updates the `UserSubscription` database state, and links transactions to the `CreditsModule`.
