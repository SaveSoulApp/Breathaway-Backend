import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditSource, CreditTransactionType, Prisma } from '@prisma/client';
import {
  ConsumeCreditsRequestDto,
  CreditLedgerQueryDto,
  GrantCreditsRequestDto,
  PaginatedCreditLedgerResponseDto,
} from './dto';
import { CreditStatusFilter } from './enums';

@Injectable()
export class CreditsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

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

  async grantCredits(
    dto: GrantCreditsRequestDto,
    tx?: Prisma.TransactionClient,
  ) {
    if (dto.source === CreditSource.LIKE_USAGE) {
      throw new BadRequestException('Cannot manually grant LIKE_USAGE credits');
    }

    const client = tx ?? this.prisma;
    return client.creditLedger.create({
      data: {
        userId: dto.userId,
        transactionType: CreditTransactionType.CREDIT,
        amount: Math.abs(dto.amount),
        source: dto.source,
        referenceId: dto.referenceId,
        expiresAt: dto.expiresAt ? DateUtil.parse(dto.expiresAt) : null,
      },
    });
  }

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

    return client.creditLedger.create({
      data: {
        userId: dto.userId,
        transactionType: CreditTransactionType.DEBIT,
        amount: Math.abs(dto.amount),
        source: CreditSource.LIKE_USAGE,
        referenceId: dto.referenceId,
      },
    });
  }

  async hasSufficientCredits(
    userId: string,
    requiredAmount = 1,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const balance = await this.getBalance(userId, tx);
    return balance >= requiredAmount;
  }

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
