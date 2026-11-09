import { Injectable } from '@nestjs/common';
import { AuthCredentialType, LikeStatus } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { JwtAuthCacheService } from '@modules/auth/services/jwt-auth-cache.service';
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
    private readonly jwtAuthCacheService: JwtAuthCacheService,
  ) {
    super(logger);
  }

  async deleteAccount(targetUserId: string, reason: string): Promise<void> {
    const ctx = { targetUserId, reason };

    const existingUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        identities: true,
        authCredentials: true,
      },
    });

    if (!existingUser || existingUser.deletedAt) {
      this.logger.warn(
        'Admin delete account failed: user not found or already deleted',
        { ...ctx, step: 'validate' },
      );
      throw new AdminUserNotFoundException();
    }

    const now = new Date();

    const phoneCred = existingUser.authCredentials?.find(
      (c) => c.type === AuthCredentialType.PHONE && c.deletedAt === null,
    );
    const primaryPhoneHash = phoneCred?.valueHash ?? null;

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Soft delete the user
        await tx.user.update({
          where: { id: targetUserId },
          data: { deletedAt: now },
        });

        // 2. Soft delete and detach identities (revert to reclaimable ghost state)
        const userIdentityIds = existingUser.identities?.map((i) => i.id) ?? [];
        if (userIdentityIds.length > 0) {
          await tx.identity.updateMany({
            where: { id: { in: userIdentityIds } },
            data: {
              userId: null,
              isVerified: false,
              deletedAt: now,
            },
          });
        }

        // 3. Soft delete auth credentials
        await tx.authCredential.updateMany({
          where: { userId: targetUserId, deletedAt: null },
          data: { deletedAt: now },
        });

        // 4. Revoke all active user sessions
        await tx.userSession.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: now },
        });

        // 5. Deactivate all devices
        await tx.device.updateMany({
          where: { userId: targetUserId, isActive: true },
          data: { isActive: false },
        });

        // 6. Dissolve active matches and void counterpart likes
        const matches = await tx.match.findMany({
          where: {
            OR: [{ userOneId: targetUserId }, { userTwoId: targetUserId }],
          },
          select: {
            id: true,
            likeOneId: true,
            likeTwoId: true,
            userOneId: true,
            userTwoId: true,
          },
        });

        if (matches.length > 0) {
          const counterpartLikeIds = matches.map((m) =>
            m.userOneId === targetUserId ? m.likeTwoId : m.likeOneId,
          );

          await tx.like.updateMany({
            where: { id: { in: counterpartLikeIds } },
            data: { status: LikeStatus.VOIDED },
          });

          await tx.match.deleteMany({
            where: {
              id: { in: matches.map((m) => m.id) },
            },
          });
        }

        // 7. Void all outbound likes sent by this user
        await tx.like.updateMany({
          where: { senderUserId: targetUserId },
          data: {
            status: LikeStatus.DELETED,
            deletedAt: now,
          },
        });

        // 8. Void all inbound pending likes targeting this user's identities
        if (userIdentityIds.length > 0) {
          await tx.like.updateMany({
            where: {
              targetIdentityId: { in: userIdentityIds },
              status: LikeStatus.PENDING,
            },
            data: {
              status: LikeStatus.VOIDED,
            },
          });
        }

        // 9. Update transactions: stamp userPhoneHash if present
        if (primaryPhoneHash) {
          await tx.transaction.updateMany({
            where: { userId: targetUserId, userPhoneHash: null },
            data: { userPhoneHash: primaryPhoneHash },
          });
        }

        // 10. Update blocks: stamp blockedPhoneHash and detach blockedUserId
        if (primaryPhoneHash) {
          await tx.block.updateMany({
            where: { blockedUserId: targetUserId },
            data: {
              blockedPhoneHash: primaryPhoneHash,
              blockedUserId: null,
            },
          });
        } else {
          await tx.block.updateMany({
            where: { blockedUserId: targetUserId },
            data: { blockedUserId: null },
          });
        }
      });
    } catch (error) {
      this.logger.error('Admin delete account transaction failed', {
        ...ctx,
        step: 'persist_delete',
        err: serializeError(error),
      });
      throw error;
    }

    // Revoke user in Redis active auth cache synchronously
    await this.jwtAuthCacheService.revokeUser(targetUserId);

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
