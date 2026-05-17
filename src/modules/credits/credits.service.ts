import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditSource, CreditTransactionType, Prisma } from '@prisma/client';
import { ConsumeCreditsRequestDto, GrantCreditsRequestDto } from './dto';

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

  async getLedger(userId: string) {
    return this.prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
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
