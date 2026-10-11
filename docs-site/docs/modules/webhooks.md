---
sidebar_position: 20
---

# Webhooks Module

The `WebhooksModule` receives incoming, automated event payloads dispatched from external partners and payment gateways.

---

## 📋 Purpose & Responsibilities

- **Cryptographic Payload Verification**: Validates signature headers (such as HMAC-SHA256 hashes or secret tokens) using timing-safe comparisons to prevent spoofed or forged webhook requests.
- **Fast Acknowledgment & Idempotency**: Acknowledges valid deliveries promptly with `200 OK`, absorbing duplicates via database unique constraints and idempotent handlers.
- **Provider Event Routing**: Dispatches verified events to specialized handlers (`CashfreePaymentHandler`, `RazorpayPaymentHandler`, `RevenueCatPurchaseHandler`, `MetaWebhookHandler`).

---

## 🔌 Supported Webhook Ingress Endpoints

| Endpoint                                  | Provider    | Guard / Authentication                               | Handled Events                                                                                    |
| :---------------------------------------- | :---------- | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `POST /api/v1/webhooks/payments/cashfree` | Cashfree PG | `CashfreeWebhookGuard` (HMAC-SHA256 Base64)          | `PAYMENT_SUCCESS_WEBHOOK`, `ORDER_PAID`, `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK` |
| `POST /api/v1/webhooks/payments/razorpay` | Razorpay    | `RazorpayWebhookGuard` (HMAC-SHA256 Hex)             | `payment.captured`, `payment.failed`                                                              |
| `POST /api/v1/webhooks/revenuecat`        | RevenueCat  | `RevenueCatWebhookGuard` (Authorization Bearer)      | `NON_RENEWING_PURCHASE`, `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`                            |
| `GET /api/v1/webhooks/meta`               | Meta        | Challenge token verification query                   | Handshake validation (`hub.challenge`)                                                            |
| `POST /api/v1/webhooks/meta`              | Meta        | `MetaWebhookGuard` (HMAC-SHA256 X-Hub-Signature-256) | Inbound WhatsApp & Instagram messaging events                                                     |

---

## 💳 Cashfree Payment Webhooks

The Cashfree webhook listener processes order fulfillment and payment failure events originating from Cashfree Payment Gateway 2.0.

### 1. Ingress Specification

- **Path**: `POST /api/v1/webhooks/payments/cashfree`
- **Security**: Protected by `CashfreeWebhookGuard`.
  - Required Headers:
    - `x-webhook-signature`: Base64-encoded HMAC-SHA256 of `timestamp + rawBody` using `CASHFREE_SECRET_KEY`.
    - `x-webhook-timestamp`: Epoch timestamp (in milliseconds or seconds).
  - **Replay Protection**: Verifies that the difference between server time and `x-webhook-timestamp` is within 300 seconds (5 minutes).
  - Uses `crypto.timingSafeEqual` to eliminate timing side-channel attacks.

### 2. Supported Events & Actions

- **`PAYMENT_SUCCESS_WEBHOOK` / `ORDER_PAID`**:
  - Checks financial ledger for existing transaction (`TransactionsService.findByGatewayTransaction`) to avoid re-granting on redeliveries.
  - In an atomic `$transaction`:
    1. Updates `PaymentOrder` status from `PENDING` to `PAID`.
    2. Records the immutable ledger row in `Transaction`.
    3. Allocates credits to the user's `UserCredit` balance.
  - Emits decoupled domain event `PAYMENT_COMPLETED_EVENT`.
- **`PAYMENT_FAILED_WEBHOOK` / `PAYMENT_USER_DROPPED_WEBHOOK`**:
  - Updates `PaymentOrder` to `FAILED` without granting credits.
- **Dashboard Test Pings & Unknown Events**:
  - Acknowledged with `200 OK` (`{ status: "ok" }`) without error, satisfying dashboard reachability tests.

---

## 🧠 Business Logic & Core Concepts

### 1. Composite Handler Pattern (Meta)

After parsing an incoming Meta webhook (e.g., a direct message), the `handleMessageIntent` method loops over an array of injected `WebhookMessageHandler` implementations. It calls `.canHandle(message)` on each and stops at the first one that accepts it. This provides a pluggable architecture for handling different types of DMs (OTPs, support tickets, etc.) without modifying the core service.

### 2. Challenge-Response Handshake (Meta)

The `verifyMetaWebhook` method enforces Meta's challenge-response protocol. When subscribing the webhook URL in the Meta Developer Portal, Meta sends a `GET` request with a challenge string. The service verifies the token and returns the _raw string_ challenge (not a JSON object) to complete the handshake.

---

## 🛠 File & Class Definitions

### Controllers & Guards

- **[WebhooksController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/webhooks.controller.ts)**: Public webhook router (`/api/v1/webhooks`), decorated with `@SkipClientIdentity()`.
- **[CashfreeWebhookGuard](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/guards/cashfree-webhook.guard.ts)**: Validates `x-webhook-signature` against `timestamp + rawBody`.
- **[RazorpayWebhookGuard](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/guards/razorpay-webhook.guard.ts)**: Validates `X-Razorpay-Signature` against `rawBody`.
- **[RevenueCatWebhookGuard](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/guards/revenuecat-webhook.guard.ts)**: Validates authorization header against shared secret.

### Handlers & DTOs

- **[CashfreePaymentHandler](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/handlers/cashfree-payment.handler.ts)**: Atomic fulfillment for Cashfree capture events.
- **[RazorpayPaymentHandler](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/handlers/razorpay-payment.handler.ts)**: Atomic fulfillment for Razorpay capture events.
- **[CashfreeWebhookRequestDto](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/webhooks/dto/request/cashfree-payment-webhook.request.dto.ts)**: Resilient DTO decorated with `@AllowNonWhitelisted()`.
