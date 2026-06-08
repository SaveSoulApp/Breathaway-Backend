import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { Injectable } from '@nestjs/common';
import { PreferencesResponseDto, UpdatePreferencesRequestDto } from './dto';

@Injectable()
export class PreferencesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  async getPreferences(userId: string): Promise<PreferencesResponseDto> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // Return defaults if somehow not created
      return {
        pushEnabled: true,
        whatsappEnabled: true,
        smsEnabled: true,
        emailEnabled: true,
      };
    }

    return preferences;
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesRequestDto,
  ): Promise<PreferencesResponseDto> {
    const updated = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        ...(dto.pushEnabled !== undefined && { pushEnabled: dto.pushEnabled }),
        ...(dto.whatsappEnabled !== undefined && {
          whatsappEnabled: dto.whatsappEnabled,
        }),
        ...(dto.smsEnabled !== undefined && { smsEnabled: dto.smsEnabled }),
        ...(dto.emailEnabled !== undefined && {
          emailEnabled: dto.emailEnabled,
        }),
      },
      create: {
        userId,
        pushEnabled: dto.pushEnabled ?? true,
        whatsappEnabled: dto.whatsappEnabled ?? true,
        smsEnabled: dto.smsEnabled ?? true,
        emailEnabled: dto.emailEnabled ?? true,
      },
    });

    this.logger.log(`Updated preferences for user ${userId}`);

    this.emitAuditLog({
      actionType: AuditActionType.PREFERENCES_UPDATED,
      userId: userId,
      metadata: {
        updatedCategories: Object.keys(dto),
      },
    });

    return updated;
  }
}
