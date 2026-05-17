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
  GrantCreditsRequestDto,
  CreditLedgerQueryDto,
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
    const now = new Date();
    const client = tx ?? this.prisma;

    const groups = await client.creditLedger.groupBy({
      by: ['transactionType'],
      _sum: {
        amount: true,
      },
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
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
        where.createdAt.gte = new Date(createdFrom);
      }
      if (createdTo) {
        const to = new Date(createdTo);
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

    const now = new Date();

    if (creditStatus) {
      if (creditStatus === CreditStatusFilter.ACTIVE) {
        where.expiresAt = { gt: now };
      } else if (creditStatus === CreditStatusFilter.EXPIRED) {
        where.expiresAt = { lte: now };
      }
    }

    if (expiresWithinDays) {
      const expiresAtMax = new Date(
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
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
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
}
