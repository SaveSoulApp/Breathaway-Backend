import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { Injectable } from '@nestjs/common';
import { PreferencesResponseDto, UpdatePreferencesRequestDto } from './dto';

/**
 * Manages user notification preference records, providing retrieval with
 * safe defaults and partial upsert updates across four communication channels.
 *
 * Preference records are expected to be created alongside the user account.
 * If a record is absent, `getPreferences` returns all-enabled defaults rather
 * than throwing, preventing a broken UX for edge-case users.
 */
@Injectable()
export class PreferencesService extends BaseService {
  /** All-channels-enabled fallback returned when no preference record exists for a user. */
  private readonly DEFAULT_PREFERENCES: PreferencesResponseDto = {
    pushEnabled: true,
    whatsappEnabled: true,
    smsEnabled: true,
    emailEnabled: true,
  };

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Retrieves the user's notification preferences, falling back to all-channels-enabled defaults
   * if no preference record exists rather than surfacing an error.
   *
   * @param userId - UUID of the user whose preferences to retrieve.
   * @returns The persisted notification preference state, or system defaults if no record exists.
   */
  async getPreferences(userId: string): Promise<PreferencesResponseDto> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      return this.DEFAULT_PREFERENCES;
    }

    return preferences;
  }

  /**
   * Retrieves notification preferences for multiple users in bulk.
   * Users without a persisted preference record will default to having all channels enabled.
   *
   * @param userIds - Array of user UUIDs whose preferences to retrieve.
   * @returns A Map where the key is the userId and the value is their PreferencesResponseDto.
   */
  async getPreferencesMany(
    userIds: string[],
  ): Promise<Map<string, PreferencesResponseDto>> {
    if (!userIds || userIds.length === 0) {
      return new Map();
    }

    const preferencesList = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds } },
    });

    const preferencesMap = new Map<string, PreferencesResponseDto>();

    // Populate with actual records
    for (const pref of preferencesList) {
      preferencesMap.set(pref.userId, pref);
    }

    // Fill in defaults for missing users
    for (const userId of userIds) {
      if (!preferencesMap.has(userId)) {
        preferencesMap.set(userId, this.DEFAULT_PREFERENCES);
      }
    }

    return preferencesMap;
  }

  /**
   * Partially updates the user's notification preferences and emits a PREFERENCES_UPDATED audit event.
   *
   * Uses an upsert to handle users whose preference record was not pre-created at account setup.
   * Only fields explicitly included in `dto` are applied; unspecified fields default to `true`
   * on first creation and are left unchanged on subsequent updates.
   *
   * @param userId - UUID of the user whose preferences to update.
   * @param dto - Subset of notification channel toggles to apply.
   * @returns The fully updated notification preference state after the upsert.
   */
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
