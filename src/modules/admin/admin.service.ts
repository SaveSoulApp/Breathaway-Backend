import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class AdminService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  async deleteAccount(targetUserId: string, reason: string): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!existingUser || existingUser.deletedAt) {
      throw new NotFoundException(
        `User not found or already deleted: ${targetUserId}`,
      );
    }

    const now = new Date();

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

    this.logger.log(
      `Admin deleted account for user: ${targetUserId}. Reason: ${reason}`,
    );

    this.emitAuditLog({
      actionType: AuditActionType.ADMIN_ACCOUNT_DELETED,
      userId: targetUserId,
      metadata: {
        deletedUserId: targetUserId,
        reason,
      },
    });
  }
}
