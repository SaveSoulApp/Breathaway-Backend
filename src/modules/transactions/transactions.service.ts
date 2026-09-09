import { SortOrder } from '@common/enums';
import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { Injectable } from '@nestjs/common';
import { PaymentGateway, Prisma, Transaction } from '@prisma/client';

import { TransactionNotFoundException } from './application/exceptions';
import {
  PaginatedTransactionResponseDto,
  RecordTransactionRequestDto,
  TransactionQueryRequestDto,
  TransactionResponseDto,
} from './dto';

/**
 * Keys stripped from any persisted gateway payload, at every depth.
 *
 * Gateways routinely echo the end user's contact details back in their webhooks
 * (RevenueCat sends `$email` / `$phoneNumber` / `$displayName` under
 * `subscriber_attributes`). This codebase encrypts identity values at rest and
 * keeps them out of logs, so a verbatim payload dump would quietly reintroduce
 * plaintext PII into the database.
 */
const PII_PAYLOAD_KEYS = new Set([
  'subscriber_attributes',
  'subscriberattributes',
  'email',
  'phone',
  'phone_number',
  'phonenumber',
  'display_name',
  'displayname',
  'contact',
]);

/**
 * Owns the transactions domain — the gateway-agnostic record of every inbound
 * money event (RevenueCat, Razorpay, ...).
 *
 * A `Transaction` row is the canonical reference for a purchase: its ULID is
 * written to `CreditLedger.referenceId`, while the gateway's own identifiers
 * stay on the transaction. The `@@unique([gateway, gatewayTransactionId])`
 * constraint is what makes webhook processing idempotent — a redelivered event
 * is rejected by the database rather than granting credits twice.
 *
 * Mutating methods accept an optional Prisma transaction client so a caller can
 * commit the transaction record and the credit grant atomically.
 */
@Injectable()
export class TransactionsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Persists an inbound gateway transaction.
   *
   * Does not catch unique-constraint violations — a duplicate
   * `(gateway, gatewayTransactionId)` surfaces as Prisma `P2002` so the caller
   * can treat it as an already-processed redelivery and skip the credit grant.
   * Swallowing it here would hide the one signal that makes the flow idempotent.
   *
   * @param dto - Gateway, identifiers, product, amount, and timing of the event.
   * @param tx  - Optional Prisma transaction client for atomic multi-step writes.
   * @returns The persisted transaction record.
   */
  async record(
    dto: RecordTransactionRequestDto,
    tx?: Prisma.TransactionClient,
  ): Promise<Transaction> {
    const client = tx ?? this.prisma;
    const ctx = {
      gateway: dto.gateway,
      gatewayTransactionId: dto.gatewayTransactionId,
      productId: dto.productId,
    };

    let transaction: Transaction;
    try {
      transaction = await client.transaction.create({
        data: {
          userId: dto.userId ?? null,
          gateway: dto.gateway,
          gatewayTransactionId: dto.gatewayTransactionId,
          gatewayEventId: dto.gatewayEventId ?? null,
          gatewayUserId: dto.gatewayUserId ?? null,
          ...(dto.type && { type: dto.type }),
          ...(dto.status && { status: dto.status }),
          environment: dto.environment,
          productId: dto.productId,
          creditsGranted: dto.creditsGranted ?? null,
          amount: dto.amount ?? null,
          currency: dto.currency ?? null,
          countryCode: dto.countryCode ?? null,
          occurredAt: DateUtil.parse(dto.occurredAt),
          rawPayload: dto.rawPayload
            ? (this.sanitizePayload(dto.rawPayload) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });
    } catch (error) {
      // P2002 is an expected outcome for a redelivered webhook, so it is logged
      // as a debug-level skip rather than an error the caller needs to act on.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug('Transaction already recorded — duplicate delivery', {
          ...ctx,
          step: 'persist_transaction',
        });
      } else {
        this.logger.error('Failed to record transaction', {
          ...ctx,
          step: 'persist_transaction',
          err: serializeError(error),
        });
      }
      throw error;
    }

    // The audit event requires an actor; an unresolved purchase has none yet.
    if (transaction.userId) {
      this.emitAuditLog({
        actionType: AuditActionType.PURCHASE_TRIGGERED,
        userId: transaction.userId,
        resourceId: transaction.id,
        metadata: {
          gateway: transaction.gateway,
          gatewayTransactionId: transaction.gatewayTransactionId,
          productId: transaction.productId,
          creditsGranted: transaction.creditsGranted,
          environment: transaction.environment,
        },
      });
    }

    this.logger.log('Transaction recorded successfully', {
      ...ctx,
      transactionId: transaction.id,
      userId: transaction.userId,
      step: 'complete',
    });

    return transaction;
  }

  /**
   * Looks up a transaction by its gateway-side identity.
   *
   * Used as a cheap pre-check before doing any grant work, so an already-processed
   * redelivery costs one indexed read instead of an aborted write transaction.
   *
   * @param gateway              - The originating gateway.
   * @param gatewayTransactionId - The gateway's own transaction identifier.
   * @param tx                   - Optional Prisma transaction client.
   * @returns The matching transaction, or `null` when it has not been seen.
   */
  async findByGatewayTransaction(
    gateway: PaymentGateway,
    gatewayTransactionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Transaction | null> {
    const client = tx ?? this.prisma;

    return client.transaction.findUnique({
      where: {
        gateway_gatewayTransactionId: { gateway, gatewayTransactionId },
      },
    });
  }

  /**
   * Returns a paginated, filtered list of transactions across all users.
   *
   * Admin-facing: unlike the credits ledger, this is deliberately not scoped to a
   * caller, so the controller must keep it behind admin authentication.
   *
   * @param query - Pagination, sorting, and filter parameters.
   * @returns A paginated envelope of transaction rows.
   */
  async findAll(
    query: TransactionQueryRequestDto,
  ): Promise<PaginatedTransactionResponseDto> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'occurredAt',
      sortOrder = SortOrder.DESC,
      userId,
      gateway,
      type,
      status,
      environment,
      productId,
      occurredFrom,
      occurredTo,
      search,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {};

    if (userId) where.userId = userId;
    if (gateway) where.gateway = gateway;
    if (type) where.type = type;
    if (status) where.status = status;
    if (environment) where.environment = environment;
    if (productId) where.productId = productId;

    if (occurredFrom || occurredTo) {
      where.occurredAt = {};
      if (occurredFrom) {
        where.occurredAt.gte = DateUtil.parse(occurredFrom);
      }
      if (occurredTo) {
        // A date-only string is expanded to end-of-day UTC so the filter covers
        // the whole calendar day. Built explicitly rather than by parsing and
        // then calling setUTCHours: dayjs reads a bare date as *local* midnight,
        // which on a machine east of UTC lands the bound on the previous day.
        where.occurredAt.lte = occurredTo.includes('T')
          ? DateUtil.parse(occurredTo)
          : new Date(`${occurredTo}T23:59:59.999Z`);
      }
    }

    if (search) {
      where.gatewayTransactionId = { contains: search, mode: 'insensitive' };
    }

    const orderBy: Prisma.TransactionOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [total, rows] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Fetches a single transaction by ID.
   *
   * @param id - ULID of the transaction.
   * @returns The matching transaction.
   * @throws {TransactionNotFoundException} When no transaction with that ID exists.
   */
  async findOne(id: string): Promise<TransactionResponseDto> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      this.logger.warn('Transaction not found', {
        transactionId: id,
        step: 'fetch',
      });
      throw new TransactionNotFoundException();
    }

    return this.toResponse(transaction);
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * Recursively removes contact details from a gateway payload before it is
   * persisted, so diagnostics never come at the cost of storing plaintext PII.
   *
   * Matching is case-insensitive and ignores `$` / `_` separators, which covers
   * the `$email` / `phone_number` / `displayName` spellings gateways mix freely.
   */
  private sanitizePayload(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizePayload(item));
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const normalized = key.toLowerCase().replace(/[$_]/g, '');
      if (
        PII_PAYLOAD_KEYS.has(key.toLowerCase()) ||
        PII_PAYLOAD_KEYS.has(normalized)
      ) {
        continue;
      }
      result[key] = this.sanitizePayload(nested);
    }
    return result;
  }

  /**
   * Maps a Prisma row to the API shape, unwrapping `Decimal` into a plain number
   * and dropping `rawPayload` (diagnostic-only, never returned to clients).
   */
  private toResponse(transaction: Transaction): TransactionResponseDto {
    return {
      id: transaction.id,
      userId: transaction.userId,
      gateway: transaction.gateway,
      gatewayTransactionId: transaction.gatewayTransactionId,
      gatewayEventId: transaction.gatewayEventId,
      gatewayUserId: transaction.gatewayUserId,
      type: transaction.type,
      status: transaction.status,
      environment: transaction.environment,
      productId: transaction.productId,
      creditsGranted: transaction.creditsGranted,
      amount:
        transaction.amount === null ? null : transaction.amount.toNumber(),
      currency: transaction.currency,
      countryCode: transaction.countryCode,
      occurredAt: transaction.occurredAt,
      createdAt: transaction.createdAt,
    };
  }
}
