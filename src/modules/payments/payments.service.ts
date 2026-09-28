import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreditSource,
  PaymentGateway,
  PaymentOrderStatus,
  Prisma,
  SubscriptionPlanStatus,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
} from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { IpGeolocationService } from '@infrastructure/ip-geolocation';
import { AuditActionType } from '@modules/audit/dto';
import { CreditsService } from '@modules/credits/credits.service';
import { IdentitiesService } from '@modules/identities/identities.service';
import { TransactionsService } from '@modules/transactions/transactions.service';

import {
  SubscriptionPlanNotFoundException,
  SubscriptionPlanPriceNotFoundException,
} from '@modules/subscriptions/application/exceptions';

import {
  GatewayNotAvailableException,
  OrderNotFoundException,
} from './application/exceptions';
import {
  CreateOrderRequestDto,
  CreateOrderResponseDto,
  OrderStatusResponseDto,
  VerifyOrderResponseDto,
} from './dto';
import {
  PAYMENT_COMPLETED_EVENT,
  PaymentCompletedEvent,
} from './events/payment-completed.event';
import { RazorpayGateway } from './gateways/razorpay/razorpay.gateway';
import { PaymentGatewayAdapter } from './gateways/payment-gateway.interface';
import { VerifyOrderRequestDto } from './dto/request/verify-order.request.dto';

/**
 * Orchestrates the web payment lifecycle: order creation, status polling,
 * client-side verification, and fulfillment.
 *
 * ## Key Design Rules
 * - Amount is **always** derived from `SubscriptionPlanPrice` — never from the request.
 * - Credits are granted inside a single `prisma.$transaction` alongside the
 *   `PaymentOrder` status update and `Transaction` insert — no partial commits.
 * - `verifyPayment` is idempotent: calling it on an already-PAID order returns
 *   the existing `creditsGranted` without re-granting.
 * - `PAYMENT_COMPLETED_EVENT` is emitted after the transaction commits so that
 *   notification delivery does not block the response.
 */
@Injectable()
export class PaymentsService extends BaseService {
  /** Map from gateway enum value → adapter instance. Built at construction time. */
  private readonly gatewayMap: Map<string, PaymentGatewayAdapter>;

  private readonly defaultCreditExpiryDays: number;
  private readonly isProduction: boolean;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly creditsService: CreditsService,
    private readonly transactionsService: TransactionsService,
    private readonly ipGeolocationService: IpGeolocationService,
    private readonly identitiesService: IdentitiesService,
    private readonly razorpayGateway: RazorpayGateway,
  ) {
    super(logger);
    this.gatewayMap = new Map([[razorpayGateway.provider, razorpayGateway]]);
    this.defaultCreditExpiryDays = this.configService.get<number>(
      'CREDIT_EXPIRY_DAYS',
      90,
    );
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a backend-side order and a gateway-side order, then returns the
   * checkout action the frontend needs to open the payment UI.
   *
   * Country resolution:
   *   1. User's `countryCode` on the `User` row (set at registration from phone).
   *   2. IP-geolocation lookup on `clientIp` as a fallback.
   *   3. `DEFAULT_COUNTRY_CODE` env var (default: "IN") as the last resort.
   *
   * @param userId    - Authenticated user's ULID.
   * @param dto       - Only contains `planId`; amount is derived server-side.
   * @param clientIp  - Used for country fallback when user has no countryCode.
   * @returns         - Full order response including checkout action.
   */
  async createOrder(
    userId: string,
    dto: CreateOrderRequestDto,
    clientIp?: string,
  ): Promise<CreateOrderResponseDto> {
    const ctx = { userId, planId: dto.planId, step: 'create_order' };

    // 1. Resolve country code for pricing and routing.
    const countryCode = await this.resolveCountryCode(userId, clientIp);

    // 2. Load plan and its price for this country.
    await this.loadActivePlan(dto.planId);
    const planPrice = await this.loadPlanPrice(dto.planId, countryCode);

    // Convert Decimal price to integer paise (multiply by 100 and round).
    const amountInSmallestUnit = Math.round(Number(planPrice.price) * 100);

    // 3. Select gateway via routing table.
    const gateway = await this.selectGateway(countryCode, amountInSmallestUnit);
    const adapter = this.gatewayMap.get(gateway.gateway);

    if (!adapter) {
      this.logger.error('No adapter registered for gateway', {
        ...ctx,
        gateway: gateway.gateway,
        step: 'resolve_adapter',
      });
      throw new GatewayNotAvailableException(countryCode);
    }

    // 4. Resolve user contact info for prefill (best-effort — never blocks the order).
    const userContact = await this.resolveUserContact(userId, dto.contact);

    // 5. Create a placeholder PaymentOrder ULID to use as the gateway receipt.
    //    We insert it after the gateway responds, using the returned gatewayOrderId.
    const receipt = this.generateReceipt();

    // 6. Call the gateway.
    this.logger.debug('Creating gateway order', {
      ...ctx,
      gateway: gateway.gateway,
      amount: amountInSmallestUnit,
      currency: planPrice.currencyCode,
    });

    const gatewayResult = await adapter.createOrder({
      amount: amountInSmallestUnit,
      currency: planPrice.currencyCode,
      receipt,
      userContact: userContact?.phone,
      userName: userContact?.name,
    });

    // 7. Persist the PaymentOrder.
    const order = await this.prisma.paymentOrder.create({
      data: {
        userId,
        planId: dto.planId,
        amount: amountInSmallestUnit,
        currency: planPrice.currencyCode,
        countryCode,
        gateway: gateway.gateway,
        status: PaymentOrderStatus.PENDING,
        gatewayOrderId: gatewayResult.gatewayOrderId,
        gatewayCreatedAt: gatewayResult.gatewayCreatedAt,
      },
      select: { id: true },
    });

    this.emitAuditLog({
      actionType: AuditActionType.PURCHASE_TRIGGERED,
      userId,
      resourceId: order.id,
      metadata: {
        gateway: gateway.gateway,
        planId: dto.planId,
        amount: amountInSmallestUnit,
        currency: planPrice.currencyCode,
        countryCode,
      },
    });

    this.logger.event(LOG_EVENT.SUBSCRIPTION_PURCHASE_INITIATED, {
      ...ctx,
      orderId: order.id,
      gateway: gateway.gateway,
      amount: amountInSmallestUnit,
    });

    return {
      orderId: order.id,
      provider: gateway.gateway,
      status: PaymentOrderStatus.PENDING,
      amount: amountInSmallestUnit,
      currency: planPrice.currencyCode,
      action: gatewayResult.action,
    };
  }

  /**
   * Returns the current status of a payment order, scoped to the authenticated user.
   *
   * The frontend polls this after the checkout closes and proceeds only on PAID.
   *
   * @param userId   - Owner check — 404 if the order doesn't belong to this user.
   * @param orderId  - Internal PaymentOrder ULID.
   */
  async getOrderStatus(
    userId: string,
    orderId: string,
  ): Promise<OrderStatusResponseDto> {
    const order = await this.prisma.paymentOrder.findFirst({
      where: { id: orderId, userId },
      select: {
        status: true,
        transaction: { select: { creditsGranted: true } },
      },
    });

    if (!order) {
      this.logger.warn('Order not found', {
        userId,
        orderId,
        step: 'get_order_status',
      });
      throw new OrderNotFoundException();
    }

    return {
      status: order.status,
      creditsGranted: order.transaction?.creditsGranted ?? null,
    };
  }

  /**
   * Verifies the Razorpay checkout signature and fulfils the order if valid.
   *
   * This is the **client-side shortcut** — it saves waiting for the webhook
   * in the happy path. The webhook remains the authoritative source of truth,
   * but if both arrive the `@@unique([gateway, gatewayTransactionId])` constraint
   * on `Transaction` prevents double-granting.
   *
   * Idempotent: if the order is already PAID (webhook arrived first),
   * returns the existing `creditsGranted` without re-granting.
   *
   * @throws {UnauthorizedException} When the signature does not match.
   * @throws {OrderNotFoundException}  When the order doesn't exist or isn't owned by the user.
   */
  async verifyPayment(
    userId: string,
    orderId: string,
    dto: VerifyOrderRequestDto,
  ): Promise<VerifyOrderResponseDto> {
    const ctx = { userId, orderId, step: 'verify_payment' };

    // 1. Load the order (owner check).
    const order = await this.prisma.paymentOrder.findFirst({
      where: { id: orderId, userId },
      include: {
        plan: {
          select: { id: true, creditsGranted: true, validityDays: true },
        },
        transaction: { select: { creditsGranted: true } },
      },
    });

    if (!order) {
      this.logger.warn('Verify payment: order not found', ctx);
      throw new OrderNotFoundException();
    }

    // 2. Idempotency: already paid by webhook → return without re-granting.
    if (order.status === PaymentOrderStatus.PAID) {
      this.logger.debug(
        'Verify payment: order already paid — idempotent skip',
        ctx,
      );
      return {
        status: PaymentOrderStatus.PAID,
        creditsGranted: order.transaction?.creditsGranted ?? null,
      };
    }

    // 3. Verify signature.
    const adapter = this.gatewayMap.get(order.gateway);
    if (!adapter) {
      throw new GatewayNotAvailableException(order.countryCode);
    }

    const signatureValid = adapter.verifySignature({
      gatewayOrderId: dto.razorpay_order_id,
      gatewayPaymentId: dto.razorpay_payment_id,
      signature: dto.razorpay_signature,
    });

    if (!signatureValid) {
      this.logger.warn('Verify payment: invalid signature', {
        ...ctx,
        gateway: order.gateway,
        step: 'verify_signature',
      });
      throw new UnauthorizedException('Invalid payment signature');
    }

    // 4. Fulfil atomically.
    const creditsGranted = await this.fulfil({
      order,
      gatewayPaymentId: dto.razorpay_payment_id,
      gatewayOrderId: dto.razorpay_order_id,
      ctx,
      rawPayload: dto as unknown as Record<string, unknown>,
    });

    return { status: PaymentOrderStatus.PAID, creditsGranted };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal fulfillment (shared by verifyPayment and reconciliation)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Atomically marks the order PAID, writes the Transaction, and grants credits.
   *
   * Called both from `verifyPayment` (client-side shortcut) and from
   * `PaymentsReconciliationService` (cron-based recovery).
   *
   * Idempotency: a duplicate `(gateway, gatewayTransactionId)` on `Transaction`
   * surfaces as Prisma P2002 — caught here and treated as an already-processed event.
   */
  async fulfil(params: {
    order: {
      id: string;
      userId: string;
      planId: string;
      plan: { id: string; creditsGranted: number; validityDays: number };
      amount: number;
      currency: string;
      countryCode: string;
      gateway: PaymentGateway;
    };
    gatewayPaymentId: string;
    gatewayOrderId: string;
    ctx: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
  }): Promise<number> {
    const { order, gatewayPaymentId, gatewayOrderId, ctx, rawPayload } = params;

    const validityDays =
      order.plan.validityDays > 0
        ? order.plan.validityDays
        : this.defaultCreditExpiryDays;
    const expiresAt = DateUtil.addDays(DateUtil.now(), validityDays);

    const environment = this.isProduction
      ? TransactionEnvironment.PRODUCTION
      : TransactionEnvironment.SANDBOX;

    let creditsGranted: number;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Mark order PAID — idempotent via conditional update.
        await tx.paymentOrder.update({
          where: { id: order.id, status: PaymentOrderStatus.PENDING },
          data: { status: PaymentOrderStatus.PAID },
        });

        // Record the Transaction (unique constraint guards against double-grant).
        const transaction = await this.transactionsService.record(
          {
            userId: order.userId,
            gateway: order.gateway,
            gatewayTransactionId: gatewayPaymentId,
            gatewayEventId: gatewayOrderId,
            status: TransactionStatus.COMPLETED,
            environment,
            channel: TransactionChannel.WEB,
            productId: order.planId,
            creditsGranted: order.plan.creditsGranted,
            amount: order.amount / 100,
            currency: order.currency,
            countryCode: order.countryCode,
            occurredAt: DateUtil.now().toISOString(),
            rawPayload,
          },
          tx,
        );

        // Link transaction back to order.
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { transactionId: transaction.id },
        });

        // Grant credits.
        await this.creditsService.grantCredits(
          {
            userId: order.userId,
            amount: order.plan.creditsGranted,
            source: CreditSource.PURCHASE,
            referenceId: transaction.id,
            expiresAt: expiresAt.toISOString(),
          },
          tx,
        );

        creditsGranted = order.plan.creditsGranted;
      });
    } catch (error) {
      // P2002 on Transaction = the webhook already processed this payment.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          'Fulfil: concurrent redelivery already processed',
          ctx,
        );
        const existing = await this.prisma.paymentOrder.findUnique({
          where: { id: order.id },
          select: { transaction: { select: { creditsGranted: true } } },
        });
        return (
          existing?.transaction?.creditsGranted ?? order.plan.creditsGranted
        );
      }
      // P2025 on the conditional update = order already paid (race with webhook).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        this.logger.debug('Fulfil: order already paid — idempotent skip', ctx);
        const existing = await this.prisma.paymentOrder.findUnique({
          where: { id: order.id },
          select: { transaction: { select: { creditsGranted: true } } },
        });
        return (
          existing?.transaction?.creditsGranted ?? order.plan.creditsGranted
        );
      }
      this.logger.error('Fulfil: atomic transaction failed', {
        ...ctx,
        step: 'fulfil_transaction',
        err: serializeError(error),
      });
      throw error;
    }

    // Emit domain event AFTER the DB transaction commits.
    this.eventEmitter.emit(
      PAYMENT_COMPLETED_EVENT,
      new PaymentCompletedEvent(
        order.userId,
        order.id,
        creditsGranted!,
        order.amount,
        order.currency,
      ),
    );

    this.logger.event(LOG_EVENT.SUBSCRIPTION_PURCHASE_COMPLETED, {
      ...ctx,
      orderId: order.id,
      userId: order.userId,
      creditsGranted: creditsGranted!,
      gateway: order.gateway,
    });

    return creditsGranted!;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  private async resolveCountryCode(
    userId: string,
    clientIp?: string,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { countryCode: true },
    });

    if (user?.countryCode) return user.countryCode;

    if (clientIp) {
      try {
        const countryCode =
          await this.ipGeolocationService.getCountryCodeByIp(clientIp);
        if (countryCode) return countryCode;
      } catch {
        // IP lookup is best-effort; fall through to env default.
      }
    }

    return this.configService.get<string>('DEFAULT_COUNTRY_CODE', 'IN');
  }

  private async loadActivePlan(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: planId, status: SubscriptionPlanStatus.ACTIVE },
      select: { id: true, creditsGranted: true, validityDays: true },
    });

    if (!plan) {
      this.logger.warn('Create order: plan not found or inactive', {
        planId,
        step: 'load_active_plan',
      });
      throw new SubscriptionPlanNotFoundException();
    }

    return plan;
  }

  private async loadPlanPrice(planId: string, countryCode: string) {
    const price = await this.prisma.subscriptionPlanPrice.findFirst({
      where: { planId, countryCode },
      select: { price: true, currencyCode: true },
    });

    if (!price) {
      this.logger.warn('Create order: no price for country', {
        planId,
        countryCode,
        step: 'load_plan_price',
      });
      throw new SubscriptionPlanPriceNotFoundException();
    }

    return price;
  }

  private async selectGateway(countryCode: string, amount: number) {
    const route = await this.prisma.paymentGatewayRoute.findFirst({
      where: {
        countryCode,
        enabled: true,
        OR: [{ minAmount: null }, { minAmount: { lte: amount } }],
        AND: [
          {
            OR: [{ maxAmount: null }, { maxAmount: { gte: amount } }],
          },
        ],
      },
      orderBy: { priority: 'asc' },
      select: { gateway: true, priority: true },
    });

    if (!route) {
      this.logger.warn('No gateway route available', {
        countryCode,
        amount,
        step: 'select_gateway',
      });
      throw new GatewayNotAvailableException(countryCode);
    }

    return route;
  }

  private async resolveUserContact(
    userId: string,
    overrideContact?: string,
  ): Promise<{ phone?: string; name?: string } | null> {
    try {
      const [profile, phone] = await Promise.all([
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: { firstName: true },
        }),
        overrideContact?.trim()
          ? Promise.resolve(overrideContact.trim())
          : this.identitiesService.getUserPhoneNumber(userId),
      ]);

      return {
        name: profile?.firstName,
        phone: phone ?? undefined,
      };
    } catch (error) {
      this.logger.warn('Failed to resolve user contact for prefill', {
        userId,
        step: 'resolve_user_contact',
        error: serializeError(error),
      });
      return null;
    }
  }

  /** Generates a short unique receipt string for the gateway. */
  private generateReceipt(): string {
    return `rcpt_${DateUtil.now().getTime()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
