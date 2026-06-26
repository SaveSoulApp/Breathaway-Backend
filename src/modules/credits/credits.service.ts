import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { CreditSource, CreditTransactionType, Prisma } from '@prisma/client';
import {
  ConsumeCreditsRequestDto,
  CreditLedgerQueryDto,
  GrantCreditsRequestDto,
  PaginatedCreditLedgerResponseDto,
} from './dto';
import { CreditStatusFilter } from './enums';

/**
 * Owns the credit economy domain — granting, consuming, querying, and expiring
 * user credit balances via an append-only double-entry ledger.
 *
 * All mutations write immutable `CreditLedger` rows rather than updating a
 * single balance field, which provides a full audit trail and supports
 * per-bundle expiration without destructive updates. This service is designed
 * to be composed into transactions by other modules (e.g., LikesService) via
 * the optional `tx` parameter on mutating methods.
 */
@Injectable()
export class CreditsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Computes a user's current spendable credit balance by summing all CREDIT
   * transactions and subtracting all DEBIT transactions from their ledger.
   *
   * Accepts an optional Prisma transaction client so callers can read the
   * balance atomically within an ongoing transaction (e.g., before consuming
   * credits to prevent a TOCTOU race).
   *
   * @param userId - UUID of the user whose balance to compute.
   * @param tx     - Optional Prisma transaction client; falls back to the shared
   *                 PrismaService instance when omitted.
   * @returns The net credit balance; returns `0` if the user has no ledger entries.
   */
  async getBalance(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;

    const groups = await client.creditLedger.groupBy({
      by: ['transactionType'],
      _sum: {
        amount: true,
      },
      where: {
        userId,
      },
    });

    let balance = 0;
    for (const group of groups) {
      if (group.transactionType === CreditTransactionType.CREDIT) {
        balance += group._sum.amount ?? 0;
      } else if (group.transactionType === CreditTransactionType.DEBIT) {
        balance -= group._sum.amount ?? 0;
      }
    }

    return balance;
  }

  /**
   * Returns a paginated, filterable view of a user's credit ledger — their
   * full transaction history including earned, spent, and expired credits.
   *
   * Supports filtering by transaction type, credit source, date range,
   * expiry window, and reference ID search. Date-only `createdTo` strings
   * (without a `T` component) are automatically expanded to end-of-day UTC
   * so the filter is inclusive of all records on that calendar day.
   *
   * @param userId - UUID of the user whose ledger to query.
   * @param query  - Pagination, sorting, and filter parameters from the request.
   * @returns A paginated result set with entries and metadata (totals, page info).
   */
  async getLedger(
    userId: string,
    query: CreditLedgerQueryDto,
  ): Promise<PaginatedCreditLedgerResponseDto> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      transactionType,
      creditStatus,
      source,
      createdFrom,
      createdTo,
      expiresWithinDays,
      search,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.CreditLedgerWhereInput = {
      userId,
    };

    if (transactionType) {
      where.transactionType = transactionType;
    }

    if (source && source.length > 0) {
      where.source = { in: source };
    }

    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) {
        where.createdAt.gte = DateUtil.parse(createdFrom);
      }
      if (createdTo) {
        const to = DateUtil.parse(createdTo);
        // Date-only strings (no "T") are parsed as midnight UTC; shift to end-of-day
        // so the filter is inclusive of all records on that calendar day.
        if (!createdTo.includes('T')) {
          to.setUTCHours(23, 59, 59, 999);
        }
        where.createdAt.lte = to;
      }
    }

    if (search) {
      where.referenceId = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const now = DateUtil.now();

    if (creditStatus) {
      if (creditStatus === CreditStatusFilter.ACTIVE) {
        where.expiresAt = { gt: now };
      } else if (creditStatus === CreditStatusFilter.EXPIRED) {
        where.expiresAt = { lte: now };
      }
    }

    if (expiresWithinDays) {
      const expiresAtMax = DateUtil.parse(
        now.getTime() + expiresWithinDays * 24 * 60 * 60 * 1000,
      );
      where.expiresAt = {
        gt: now,
        lte: expiresAtMax,
      };
    }

    const orderBy: Prisma.CreditLedgerOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [total, data] = await Promise.all([
      this.prisma.creditLedger.count({ where }),
      this.prisma.creditLedger.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          transactionType: true,
          amount: true,
          source: true,
          referenceId: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
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
   * Fetches a single credit ledger entry by ID, scoped to the requesting user.
   *
   * The `userId` scope prevents users from reading other users' transaction
   * records even if they know a valid entry UUID.
   *
   * @param userId - UUID of the authenticated user; used to enforce row-level ownership.
   * @param id     - UUID of the ledger entry to retrieve.
   * @returns The matching ledger entry with its transaction details.
   * @throws {NotFoundException} When no entry exists for the given `id` owned by `userId`.
   */
  async getLedgerEntry(userId: string, id: string) {
    const entry = await this.prisma.creditLedger.findFirst({
      where: { id, userId },
      select: {
        id: true,
        transactionType: true,
        amount: true,
        source: true,
        referenceId: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (!entry) {
      throw new NotFoundException('Ledger entry not found');
    }

    return entry;
  }

  /**
   * Adds credits to a user's account by writing a CREDIT ledger entry and
   * emitting an audit event for traceability.
   *
   * `LIKE_USAGE` is a system-only source reserved for automated debit
   * processing; manually granting credits under this source is blocked to
   * prevent misuse. Supports an optional Prisma transaction client so the
   * grant can be committed atomically alongside related operations (e.g.,
   * a purchase confirmation).
   *
   * @param dto - Recipient, amount, source, optional reference ID, and optional expiry.
   * @param tx  - Optional Prisma transaction client for atomic multi-step operations.
   * @returns The newly created `CreditLedger` record.
   * @throws {BadRequestException} When `dto.source` is `LIKE_USAGE`.
   */
  async grantCredits(
    dto: GrantCreditsRequestDto,
    tx?: Prisma.TransactionClient,
  ) {
    if (dto.source === CreditSource.LIKE_USAGE) {
      throw new BadRequestException('Cannot manually grant LIKE_USAGE credits');
    }

    const client = tx ?? this.prisma;
    const ledger = await client.creditLedger.create({
      data: {
        userId: dto.userId,
        transactionType: CreditTransactionType.CREDIT,
        amount: Math.abs(dto.amount),
        source: dto.source,
        referenceId: dto.referenceId,
        expiresAt: dto.expiresAt ? DateUtil.parse(dto.expiresAt) : null,
      },
    });

    this.emitAuditLog({
      actionType: AuditActionType.CREDITS_GRANTED,
      userId: dto.userId,
      resourceId: ledger.id,
      metadata: {
        amount: Math.abs(dto.amount),
        source: dto.source,
        transactionId: dto.referenceId,
      },
    });

    return ledger;
  }

  /**
   * Deducts credits from a user's account by writing a `LIKE_USAGE` DEBIT
   * ledger entry, enforcing that the balance is sufficient before the write.
   *
   * The balance check and ledger insert are designed to be wrapped in a
   * Prisma transaction by the caller to prevent concurrent over-spend.
   * Emits a `USAGE_TRIGGERED` audit event on success.
   *
   * @param dto - Target user, amount to deduct, and an optional reference ID
   *              linking this debit to the triggering resource (e.g., a Like ID).
   * @param tx  - Optional Prisma transaction client; strongly recommended to
   *              prevent race conditions on concurrent debit requests.
   * @returns The newly created DEBIT `CreditLedger` record.
   * @throws {BadRequestException} When the user's current balance is less than `dto.amount`.
   */
  async consumeCredits(
    dto: ConsumeCreditsRequestDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    const hasSufficient = await this.hasSufficientCredits(
      dto.userId,
      dto.amount,
      client,
    );

    if (!hasSufficient) {
      throw new BadRequestException('Insufficient credits');
    }

    const ledger = await client.creditLedger.create({
      data: {
        userId: dto.userId,
        transactionType: CreditTransactionType.DEBIT,
        amount: Math.abs(dto.amount),
        source: CreditSource.LIKE_USAGE,
        referenceId: dto.referenceId,
      },
    });

    this.emitAuditLog({
      actionType: AuditActionType.USAGE_TRIGGERED,
      userId: dto.userId,
      resourceId: ledger.id,
      metadata: {
        amount: Math.abs(dto.amount),
        usageType: CreditSource.LIKE_USAGE,
      },
    });

    return ledger;
  }

  /**
   * Checks whether a user holds enough credits to cover a required spend,
   * without modifying any ledger state.
   *
   * Delegates the balance computation to `getBalance`, accepting the same
   * optional transaction client to allow atomic read-then-write patterns.
   *
   * @param userId         - UUID of the user to check.
   * @param requiredAmount - Minimum credit balance required; defaults to `1`.
   * @param tx             - Optional Prisma transaction client for consistency
   *                         within an ongoing transaction.
   * @returns `true` when the user's balance meets or exceeds `requiredAmount`.
   */
  async hasSufficientCredits(
    userId: string,
    requiredAmount = 1,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const balance = await this.getBalance(userId, tx);
    return balance >= requiredAmount;
  }

  /**
   * Scheduled job that enforces credit expiry across all users by inserting
   * compensating DEBIT entries for any unused portions of expired credit bundles.
   *
   * Uses a FIFO-with-expiry allocation strategy: debits are consumed against
   * the earliest-expiring credits first. Only the portion of a credit bundle
   * that was not already consumed by prior debits is expired. This prevents
   * double-counting and ensures the ledger remains consistent after the job runs.
   *
   * This method is idempotent for already-expired bundles that have been fully
   * consumed — no DEBIT row is inserted when `unusedAmount` is zero. Logs a
   * summary upon completion for GCP Cloud Logging visibility.
   *
   * @returns A summary with the count of users processed and the total number
   *          of expiration DEBIT rows inserted.
   */
  async expireCreditBundles(): Promise<{
    processedUsers: number;
    totalExpiredDebitsInserted: number;
  }> {
    const now = DateUtil.now();

    const usersWithPotentiallyExpiredCredits =
      await this.prisma.creditLedger.findMany({
        where: {
          transactionType: CreditTransactionType.CREDIT,
          expiresAt: { lte: now },
        },
        select: { userId: true },
        distinct: ['userId'],
      });

    let processedUsers = 0;
    let totalExpiredDebitsInserted = 0;

    for (const { userId } of usersWithPotentiallyExpiredCredits) {
      const ledger = await this.prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });

      let totalDebits = ledger
        .filter((l) => l.transactionType === CreditTransactionType.DEBIT)
        .reduce((sum, l) => sum + l.amount, 0);

      const credits = ledger
        .filter((l) => l.transactionType === CreditTransactionType.CREDIT)
        .sort((a, b) => {
          if (a.expiresAt && b.expiresAt) {
            if (a.expiresAt.getTime() === b.expiresAt.getTime()) {
              return a.createdAt.getTime() - b.createdAt.getTime();
            }
            return a.expiresAt.getTime() - b.expiresAt.getTime();
          }
          if (a.expiresAt && !b.expiresAt) return -1;
          if (!a.expiresAt && b.expiresAt) return 1;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

      const expirationsToInsert: Prisma.CreditLedgerCreateManyInput[] = [];

      for (const credit of credits) {
        let usedFromThisCredit = 0;
        if (totalDebits >= credit.amount) {
          usedFromThisCredit = credit.amount;
          totalDebits -= credit.amount;
        } else {
          usedFromThisCredit = totalDebits;
          totalDebits = 0;
        }

        const unusedAmount = credit.amount - usedFromThisCredit;

        if (credit.expiresAt && credit.expiresAt <= now && unusedAmount > 0) {
          expirationsToInsert.push({
            userId,
            transactionType: CreditTransactionType.DEBIT,
            amount: unusedAmount,
            source: CreditSource.EXPIRED,
            referenceId: credit.id,
            createdAt: now,
          });
        }
      }

      if (expirationsToInsert.length > 0) {
        await this.prisma.creditLedger.createMany({
          data: expirationsToInsert,
        });
        totalExpiredDebitsInserted += expirationsToInsert.length;
      }
      processedUsers++;
    }

    this.logger.log(
      `Expiration job complete. Processed ${processedUsers} users. Inserted ${totalExpiredDebitsInserted} expiration debits.`,
    );

    return { processedUsers, totalExpiredDebitsInserted };
  }
}
