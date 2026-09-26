---
sidebar_position: 21
---

# Payments Module

The `PaymentsModule` orchestrates provider-agnostic payment processing for the web application, managing order creation, client checkout dispatch, server-side signature verification, idempotency tracking, and autonomous reconciliation.

---

## 📋 Purpose & Responsibilities

- **Checkout Initialization**: Resolves localized pricing and dynamic provider routes, initiating payment orders at external gateways.
- **Provider Action Dispatch**: Emits a discriminated `action` object (`sdk`, `redirect`, `form_post`) instructing dumb client applications how to render checkout UI without hardcoded gateway logic.
- **Cryptographic Signature Verification**: Validates gateway callbacks using HMAC-SHA256 and constant-time string comparisons.
- **Atomic Credit Fulfillment**: Coordinates with `TransactionsModule` and `CreditsModule` in a unified database transaction to grant credit balances on successful purchases.
- **Autonomous Reconciliation**: Background cron sweeper that inspects stale `PENDING` orders, settling captured transactions and expiring abandoned ones.
- **Decoupled Domain Communication**: Emits `PAYMENT_COMPLETED_EVENT` upon fulfillment to drive asynchronous receipt delivery and audit logging.

---

## 🏗 Directory & Component Structure

```
src/modules/payments/
├── application/
│   └── exceptions/
│       ├── gateway-not-available.exception.ts     # 503: No active route for country
│       ├── gateway-order-creation.exception.ts    # 502: Upstream provider rejected order
│       ├── order-already-paid.exception.ts        # 409: Duplicate fulfillment attempt
│       ├── order-not-found.exception.ts           # 404: Order not found or user mismatch
│       └── index.ts                               # Barrel export
├── dto/
│   ├── request/
│   │   ├── create-order.request.dto.ts            # Body: { planId }
│   │   └── verify-order.request.dto.ts            # Body: { razorpay_order_id, ... }
│   ├── response/
│   │   ├── create-order.response.dto.ts           # Response: { orderId, provider, action }
│   │   └── order-status.response.dto.ts           # Response: { status, creditsGranted }
│   └── index.ts                                   # Barrel export
├── events/
│   ├── payment-completed.event.ts                 # Strongly typed domain event
│   └── index.ts
├── gateways/
│   ├── payment-gateway.interface.ts               # Core PaymentGatewayAdapter contract
│   ├── razorpay/
│   │   └── razorpay.gateway.ts                    # Razorpay Node SDK implementation
│   └── index.ts
├── tests/
│   ├── payments.controller.spec.ts                # HTTP endpoint & controller unit tests
│   ├── payments.service.spec.ts                   # Core business logic & transaction tests
│   ├── payments.reconciliation.spec.ts            # Cron polling & stale order sweep tests
│   └── razorpay.gateway.spec.ts                   # Gateway adapter & signature tests
├── payments.controller.ts                         # REST controller exposing endpoints
├── payments.service.ts                            # Core fulfillment & order orchestration
├── payments.reconciliation.ts                     # Background @Cron reconciliation engine
└── payments.module.ts                             # NestJS feature module configuration
```

---

## ⚙️ Managed Enums

The payments engine uses standard Prisma schema enums to ensure strict type safety across database operations, DTOs, and controllers:

### 1. PaymentOrderStatus

Tracks the lifecycle state of a payment order:

- **`PENDING`**: Initial order created at the gateway, waiting for customer payment.
- **`PAID`**: Payment captured and verified; credits granted to user account.
- **`FAILED`**: Payment failed, declined, or cancelled by the user.
- **`EXPIRED`**: Order was not completed within the 30-minute validity window.
- **`REFUNDED`**: Payment was refunded after capture.

### 2. PaymentGateway

Supported gateway providers:

- **`RAZORPAY`**: Primary web checkout adapter for Indian and international cards/UPI.
- **`CASHFREE`**: Secondary Indian checkout provider (planned).
- **`DECENTRO`**: Direct bank UPI collection gateway (planned).
- **`EASEBUZZ`**: Alternate Indian merchant aggregator (planned).
- **`REVENUECAT`**: Mobile in-app purchase aggregator (iOS App Store / Google Play).

---

## 🔌 REST API Specification

### 1. Create Payment Order

Initializes a payment order for the requested subscription plan. The backend determines the country, pricing, and gateway provider.

- **Endpoint**: `POST /api/v1/payments/orders`
- **Authentication**: Bearer JWT (Authenticated User)
- **Headers**:
  - `X-Forwarded-For`: _(Optional)_ Client IP used for geographic fallback lookup if user country is missing.

#### Request Body (`CreateOrderRequestDto`)

```json
{
  "planId": "01J8VXYZ1234ABCDEFGHJKMNPQ"
}
```

> **Security Note**: The request body deliberately excludes currency and amount. The backend queries `SubscriptionPlanPrice` by country code to calculate the payable amount server-side.

#### Response Body (`CreateOrderResponseDto`)

```json
{
  "orderId": "01J90ABC1234DEF5678GHI90JK",
  "provider": "RAZORPAY",
  "status": "PENDING",
  "amount": 49900,
  "currency": "INR",
  "action": {
    "type": "sdk",
    "keyId": "rzp_test_1234567890",
    "gatewayOrderId": "order_PZzFNjKiHwPLnZ",
    "prefill": {
      "name": "Jane",
      "contact": "+919876543210"
    }
  }
}
```

---

### 2. Get Order Status (Polling)

Returns the current status of an order. The web app polls this endpoint after the gateway modal closes and proceeds only when `status === "PAID"`.

- **Endpoint**: `GET /api/v1/payments/orders/:orderId`
- **Authentication**: Bearer JWT (Owner verification: returns 404 if order does not belong to user)

#### Response Body (`OrderStatusResponseDto`)

```json
{
  "status": "PAID",
  "creditsGranted": 10
}
```

---

### 3. Verify Payment (Client-Side Callback)

Submits the signature payload returned by the gateway checkout SDK to trigger immediate verification and fulfillment.

- **Endpoint**: `POST /api/v1/payments/orders/:orderId/verify`
- **Authentication**: Bearer JWT

#### Request Body (`VerifyOrderRequestDto`)

```json
{
  "razorpay_order_id": "order_PZzFNjKiHwPLnZ",
  "razorpay_payment_id": "pay_PZzFNjKiHwPLnZ",
  "razorpay_signature": "a1b2c3d4e5f67890abcdef1234567890abcdef12"
}
```

#### Response Body (`VerifyOrderResponseDto`)

```json
{
  "status": "PAID",
  "creditsGranted": 10
}
```

---

## 🔄 Internal Module Flow

The following sequence illustrates the internal method invocations within `PaymentsModule` during order creation:

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client Application
    participant Ctrl as PaymentsController
    participant Svc as PaymentsService
    participant Geo as IpGeolocationService
    participant Prisma as PrismaService
    participant Gateway as RazorpayGateway

    Client ->> Ctrl: POST /payments/orders { planId }
    Ctrl ->> Svc: createOrder(userId, { planId }, clientIp)
    activate Svc

    Svc ->> Prisma: Query User for existing countryCode
    alt User countryCode missing
        Svc ->> Geo: getCountryCodeByIp(clientIp)
        Geo -->> Svc: Resolved countryCode (e.g., "IN")
    end

    Svc ->> Prisma: loadActivePlan(planId) [where status: ACTIVE]
    Svc ->> Prisma: loadPlanPrice(planId, countryCode)
    Svc ->> Prisma: selectGateway(countryCode, amount) [PaymentGatewayRoute query]

    Svc ->> Gateway: createOrder({ amount, currency, receipt, userName })
    Gateway -->> Svc: GatewayOrderResult { gatewayOrderId, action }

    Svc ->> Prisma: paymentOrder.create(data: { userId, planId, amount, gateway, status: PENDING })
    Svc -->> Ctrl: CreateOrderResponseDto
    deactivate Svc
    Ctrl -->> Client: 201 Created { orderId, provider, status, action }
```

---

## 🔌 The Gateway Adapter Pattern

The `PaymentsModule` interacts with external payment gateways exclusively through the **`PaymentGatewayAdapter`** interface. This prevents vendor lock-in and makes adding new gateways straightforward.

### Adapter Interface Contract

```typescript
export interface PaymentGatewayAdapter {
  /** Gateway identifier corresponding to Prisma PaymentGateway enum. */
  readonly gateway: PaymentGateway;

  /** Initializes an order with the external provider. */
  createOrder(params: GatewayCreateOrderParams): Promise<GatewayOrderResult>;

  /** Polls current order status (used by reconciliation cron). */
  fetchOrderStatus(gatewayOrderId: string): Promise<GatewayOrderStatus>;

  /** Verifies checkout signature returned to browser. */
  verifySignature(params: GatewayVerifyParams): boolean;

  /** Fetches captured payment ID for reconciliation deduplication. */
  fetchCapturedPaymentId?(gatewayOrderId: string): Promise<string | null>;
}
```

### Checkout Action Shapes (`PaymentActionDto`)

The frontend branches solely on `action.type`, keeping checkout UI decoupled:

| Action Type     | Typical Gateways         | Frontend Handling                           | Action Payload Fields                   |
| :-------------- | :----------------------- | :------------------------------------------ | :-------------------------------------- |
| **`sdk`**       | Razorpay, Cashfree       | Opens client SDK modal with publishable key | `keyId`, `gatewayOrderId`, `prefill`    |
| **`redirect`**  | Decentro, UPI Intent     | Redirects browser window to hosted checkout | `url`                                   |
| **`form_post`** | NetBanking / Legacy Bank | Injects and submits a hidden HTML form      | `url`, `fields: Record<string, string>` |

---

## 📡 Decoupled Domain Events

In accordance with system-wide architectural rules, `PaymentsService` **never** imports `NotificationsModule` directly.

Upon committing fulfillment in the database, `PaymentsService` emits a `PAYMENT_COMPLETED_EVENT`:

```typescript
this.eventEmitter.emit(
  PAYMENT_COMPLETED_EVENT,
  new PaymentCompletedEvent(
    order.userId,
    order.id,
    creditsGranted,
    order.amount,
    order.currency,
  ),
);
```

The centralized `NotificationEventsListener` (`src/modules/notifications/listeners/notification-events.listener.ts`) listens asynchronously:

```typescript
@OnEvent(PAYMENT_COMPLETED_EVENT, { async: true })
async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
  // Dispatches payment confirmation email and in-app notification
}
```

---

## ⚠️ Exception Hierarchy & HTTP Mapping

Domain exceptions in `application/exceptions/` are automatically mapped to standard HTTP response codes via the project's exception filters:

| Domain Exception                             | HTTP Status Code          | Description / Cause                                                        |
| :------------------------------------------- | :------------------------ | :------------------------------------------------------------------------- |
| **`SubscriptionPlanNotFoundException`**      | `404 Not Found`           | The specified `planId` does not exist or has `status: INACTIVE`.           |
| **`SubscriptionPlanPriceNotFoundException`** | `404 Not Found`           | No localized price is defined for the resolved `countryCode`.              |
| **`OrderNotFoundException`**                 | `404 Not Found`           | The `orderId` was not found or does not belong to the authenticated user.  |
| **`OrderAlreadyPaidException`**              | `409 Conflict`            | Attempted manual verification on an order that has already been fulfilled. |
| **`GatewayNotAvailableException`**           | `503 Service Unavailable` | No active `PaymentGatewayRoute` is configured for the country and amount.  |
| **`GatewayOrderCreationException`**          | `502 Bad Gateway`         | The upstream gateway (e.g. Razorpay) rejected order creation.              |
| **`UnauthorizedException`**                  | `401 Unauthorized`        | Invalid HMAC-SHA256 signature in `POST /verify`.                           |

---

## 🔑 Environment Configuration

All runtime secrets and parameters are retrieved via NestJS `ConfigService`:

| Variable Name             | Environment    | Description                                                        | Example Value                             |
| :------------------------ | :------------- | :----------------------------------------------------------------- | :---------------------------------------- |
| `RAZORPAY_KEY_ID`         | Sandbox / Prod | Publishable key surfaced to client SDK.                            | `rzp_test_...` / `rzp_live_...`           |
| `RAZORPAY_KEY_SECRET`     | Sandbox / Prod | Secret key for order creation & signature verification.            | `SecretManager(projects/.../secrets/...)` |
| `RAZORPAY_WEBHOOK_SECRET` | Sandbox / Prod | Shared secret for validating inbound webhook HMAC.                 | `SecretManager(projects/.../secrets/...)` |
| `DEFAULT_COUNTRY_CODE`    | All            | Fallback ISO-3166-1 alpha-2 code when geolocation fails.           | `IN`                                      |
| `CREDIT_EXPIRY_DAYS`      | All            | Default validity duration for granted credits if plan specifies 0. | `90`                                      |

---

## 🧪 Testing & Quality Assurance

The module ships with comprehensive unit tests for all components:

- **`payments.controller.spec.ts`**: Tests controller delegation, parameter mapping, `@ClientIp()` extraction, and response DTO formatting.
- **`payments.service.spec.ts`**: Tests server-side price derivation, IP geolocation resolution, atomic Prisma `$transaction` execution, duplicate event idempotency (P2002/P2025), and domain event emissions.
- **`payments.reconciliation.spec.ts`**: Tests stale order polling (>15 min), auto-expiration of orders (>30 min), gateway status synchronization, and concurrent race-condition absorption.
- **`razorpay.gateway.spec.ts`**: Tests Razorpay SDK parameter construction, order translation, HMAC-SHA256 signature verification, and gateway status normalization.
