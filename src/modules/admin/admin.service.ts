import { Injectable } from '@nestjs/common';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { USER_DELETED_EVENT, UserDeletedEvent } from '@modules/profiles/events';

import { AdminUserNotFoundException } from './application/exceptions';
import { TruncateDatabaseRequestDto, TruncateDatabaseResponseDto } from './dto';

export const TRUNCATED_DATABASE_TABLES = [
  'AuthCredential',
  'Block',
  'ChatRoom',
  'ConsentLedger',
  'CreditLedger',
  'Device',
  'DsarExport',
  'Identity',
  'Like',
  'Match',
  'Message',
  'Notification',
  'NotificationPreference',
  'PaymentOrder',
  'SubscriptionEvent',
  'Transaction',
  'User',
  'UserProfile',
  'UserSession',
  'UserSubscription',
] as const;

@Injectable()
export class AdminService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  async deleteAccount(targetUserId: string, reason: string): Promise<void> {
    const ctx = { targetUserId, reason };

    const existingUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!existingUser || existingUser.deletedAt) {
      this.logger.warn(
        'Admin delete account failed: user not found or already deleted',
        { ...ctx, step: 'validate' },
      );
      throw new AdminUserNotFoundException();
    }

    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        // Soft delete the user
        await tx.user.update({
          where: { id: targetUserId },
          data: { deletedAt: now },
        });

        // Soft delete identities
        await tx.identity.updateMany({
          where: { userId: targetUserId, deletedAt: null },
          data: { deletedAt: now },
        });

        // Soft delete auth credentials
        await tx.authCredential.updateMany({
          where: { userId: targetUserId, deletedAt: null },
          data: { deletedAt: now },
        });

        // Deactivate all devices
        await tx.device.updateMany({
          where: { userId: targetUserId, isActive: true },
          data: { isActive: false },
        });
      });
    } catch (error) {
      this.logger.error('Admin delete account transaction failed', {
        ...ctx,
        step: 'persist_delete',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.event(LOG_EVENT.ADMIN_ACCOUNT_DELETED, {
      targetUserId: ctx.targetUserId,
      reason: ctx.reason,
    });

    this.emitAuditLog({
      actionType: AuditActionType.ADMIN_ACCOUNT_DELETED,
      userId: targetUserId,
      metadata: {
        deletedUserId: targetUserId,
        reason,
      },
    });

    this.eventEmitter.emit(
      USER_DELETED_EVENT,
      new UserDeletedEvent(targetUserId),
    );
  }

  /**
   * Truncates database contents for internal and staging testing from scratch.
   *
   * Executes atomic CASCADE truncation across all 20 user, session, interaction,
   * ledger, and order tables, while completely preserving subscription plans,
   * pricing history, and payment gateway configurations.
   *
   * @param dto - Container for confirmation keyword and operational reason.
   * @returns Summary of successfully truncated tables and execution timestamp.
   */
  async truncateDatabase(
    dto: TruncateDatabaseRequestDto,
  ): Promise<TruncateDatabaseResponseDto> {
    const ctx = { reason: dto.reason };

    this.logger.warn('Admin database truncate initiated', {
      ...ctx,
      step: 'initiate_truncate',
    });

    const truncateSql = `
      TRUNCATE TABLE
        "AuthCredential",
        "Block",
        "ChatRoom",
        "ConsentLedger",
        "CreditLedger",
        "Device",
        "DsarExport",
        "Identity",
        "Like",
        "Match",
        "Message",
        "Notification",
        "NotificationPreference",
        "PaymentOrder",
        "SubscriptionEvent",
        "Transaction",
        "User",
        "UserProfile",
        "UserSession",
        "UserSubscription"
      RESTART IDENTITY CASCADE;
    `;

    try {
      await this.prisma.$executeRawUnsafe(truncateSql);
    } catch (error) {
      this.logger.error('Admin database truncate failed', {
        ...ctx,
        step: 'execute_truncate',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.event(LOG_EVENT.ADMIN_DATABASE_TRUNCATED, {
      truncatedTables: [...TRUNCATED_DATABASE_TABLES],
      reason: dto.reason,
    });

    this.emitAuditLog({
      actionType: AuditActionType.ADMIN_DATABASE_TRUNCATED,
      userId: 'SYSTEM',
      metadata: {
        truncatedTables: [...TRUNCATED_DATABASE_TABLES],
        reason: dto.reason,
      },
    });

    return {
      success: true,
      message: 'Database truncated successfully',
      truncatedTables: [...TRUNCATED_DATABASE_TABLES],
      timestamp: new Date().toISOString(),
    };
  }
}
