import { PaymentGateway } from '@prisma/client';

/**
 * Parameters passed to the gateway adapter when creating an order.
 */
export interface GatewayCreateOrderParams {
  /** Amount in smallest currency unit (e.g. 39900 for ₹399). */
  amount: number;
  /** ISO-4217 currency code (e.g. "INR"). */
  currency: string;
  /** Unique receipt / reference for the order (our internal orderId). */
  receipt: string;
  /** Optional user contact for prefill. */
  userContact?: string;
  /** Optional user name for prefill. */
  userName?: string;
}

/**
 * The action shape the frontend uses to open a checkout.
 * Discriminated on `type` — the frontend branches only on this field.
 */
export type GatewayOrderAction =
  | {
      type: 'sdk';
      /** Gateway publishable key — safe to send to the browser. */
      keyId: string;
      /** Gateway-side order identifier (e.g. Razorpay order_Nx...). */
      gatewayOrderId: string;
      /** Prefill data for the checkout form. */
      prefill?: { contact?: string; name?: string };
    }
  | {
      type: 'redirect';
      /** URL the browser should redirect to. */
      url: string;
    }
  | {
      type: 'form_post';
      /** POST target URL. */
      url: string;
      /** Hidden form field key-value pairs. */
      fields: Record<string, string>;
    };

/**
 * Result returned by `PaymentGatewayAdapter.createOrder`.
 */
export interface GatewayOrderResult {
  /** Gateway-side order identifier persisted to `PaymentOrder.gatewayOrderId`. */
  gatewayOrderId: string;
  /** When the gateway created the order (for audit). */
  gatewayCreatedAt?: Date;
  /** The checkout action the frontend should execute. */
  action: GatewayOrderAction;
}

/**
 * Normalised status returned by `PaymentGatewayAdapter.fetchOrderStatus`.
 * Used by the reconciliation cron.
 */
export type GatewayOrderStatus =
  | 'CAPTURED'
  | 'AUTHORIZED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PENDING';

/**
 * Parameters for server-side signature verification after checkout closes.
 */
export interface GatewayVerifyParams {
  /** Our internal PaymentOrder id — used as half of the signed payload. */
  gatewayOrderId: string;
  /** The payment id returned by the gateway SDK after the user pays. */
  gatewayPaymentId: string;
  /** The HMAC signature provided by the gateway to the browser. */
  signature: string;
}

/**
 * Contract every payment gateway adapter must satisfy.
 *
 * Adding a new provider (Cashfree, Decentro, Easebuzz) means implementing
 * this interface and registering the adapter in `PaymentsModule` — no changes
 * to `PaymentsService` are needed.
 */
export interface PaymentGatewayAdapter {
  /** The enum value this adapter handles. Used for routing. */
  readonly provider: PaymentGateway;

  /**
   * Create a gateway-side order and return the checkout action.
   *
   * @throws {GatewayOrderCreationException} When the upstream API call fails.
   */
  createOrder(params: GatewayCreateOrderParams): Promise<GatewayOrderResult>;

  /**
   * Poll the gateway for the current status of an existing order.
   * Used by the reconciliation cron for stale PENDING orders.
   */
  fetchOrderStatus(gatewayOrderId: string): Promise<GatewayOrderStatus>;

  /**
   * Optional helper to fetch the captured payment identifier from the gateway.
   * Used by reconciliation to populate the canonical Transaction.gatewayTransactionId.
   */
  fetchCapturedPaymentId?(gatewayOrderId: string): Promise<string | null>;

  /**
   * Verify the client-side signature provided by the gateway after checkout.
   *
   * @returns `true` when the signature is valid.
   */
  verifySignature(params: GatewayVerifyParams): boolean;
}
