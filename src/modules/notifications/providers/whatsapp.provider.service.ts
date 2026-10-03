import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuthCredentialType, Device, IdentityType } from '@prisma/client';
import Redis from 'ioredis';
import { parsePhoneNumberWithError } from 'libphonenumber-js';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import {
  type IWhatsAppAdapter,
  WHATSAPP_ADAPTER_TOKEN,
} from '../whatsapp/adapters/whatsapp-adapter.interface';
import { WHATSAPP_TEMPLATE_MAP } from '../whatsapp/whatsapp-template.registry';
import { INotificationProvider } from './notification-provider.interface';

/**
 * Service responsible for orchestrating WhatsApp notification dispatch:
 * 1. Resolves recipient user phone numbers via encrypted Identity/AuthCredential records.
 * 2. Deduplicates event dispatches (e.g. per match per recipient) using Redis with in-memory fallback.
 * 3. Maps domain NotificationType to Meta template configurations.
 * 4. Dispatches messages via the configured IWhatsAppAdapter (LiteApp / Meta).
 */
@Injectable()
export class WhatsAppProviderService
  extends BaseService
  implements INotificationProvider
{
  private readonly inMemorySentKeys = new Map<string, number>();
  private readonly DEDUP_TTL_SECONDS = 24 * 60 * 60; // 24 hours (1 day)
  private readonly DEDUP_TTL_MS = this.DEDUP_TTL_SECONDS * 1000;

  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly identityCryptoService: IdentityCryptoService,
    @Inject(WHATSAPP_ADAPTER_TOKEN)
    private readonly whatsAppAdapter: IWhatsAppAdapter,
    @Optional()
    @Inject('REDIS_CLIENT')
    private readonly redisClient?: Redis,
  ) {
    super(loggerService);
  }

  /**
   * Dispatches WhatsApp notifications to the provided recipients.
   *
   * @param payloadDto - The notification request payload containing userIds, type, and parameters.
   * @param _devices - Unused by WhatsApp transport.
   * @param _userNotificationIdMap - Unused by WhatsApp transport.
   */
  async send(
    payloadDto: SendNotificationRequestDto,
    _devices?: Device[],
    _userNotificationIdMap?: Map<string, string>,
  ): Promise<void> {
    if (!payloadDto.userIds || payloadDto.userIds.length === 0) {
      return;
    }

    const templateConfig = WHATSAPP_TEMPLATE_MAP[payloadDto.type];
    if (!templateConfig) {
      this.logger.debug(
        'No WhatsApp template mapped for notification type, skipping send',
        {
          notificationType: payloadDto.type,
          userCount: payloadDto.userIds.length,
          step: 'template_lookup',
        },
      );
      return;
    }

    const phoneNumbersByUser = await this.resolveUserPhoneNumbers(
      payloadDto.userIds,
    );

    if (phoneNumbersByUser.size === 0) {
      this.logger.debug(
        'No verified phone numbers found for recipients, skipping WhatsApp send',
        {
          notificationType: payloadDto.type,
          userCount: payloadDto.userIds.length,
          step: 'resolve_phone_numbers',
        },
      );
      return;
    }

    for (const userId of payloadDto.userIds) {
      const recipientPhone = phoneNumbersByUser.get(userId);
      if (!recipientPhone) {
        continue;
      }

      const matchId =
        (payloadDto.payload?.matchId as string | undefined) ||
        (payloadDto.link?.startsWith('/matches/')
          ? payloadDto.link.replace('/matches/', '')
          : undefined);

      if (matchId) {
        const dedupKey = `whatsapp:match:${matchId}:${userId}`;
        const isDuplicate = await this.isDuplicateAndMark(dedupKey);
        if (isDuplicate) {
          this.logger.log(
            'Duplicate WhatsApp match notification suppressed for user',
            {
              userId,
              matchId,
              step: 'dedup_check',
            },
          );
          continue;
        }
      }

      const extraParams = templateConfig.buildPayload
        ? templateConfig.buildPayload(payloadDto.payload ?? {})
        : undefined;

      try {
        await this.whatsAppAdapter.send({
          to: recipientPhone,
          template: templateConfig.template,
          language: templateConfig.language,
          params: extraParams,
        });

        this.logger.log(
          'WhatsApp notification sent successfully to recipient',
          {
            userId,
            notificationType: payloadDto.type,
            template: templateConfig.template,
            step: 'dispatch_success',
          },
        );
      } catch (err) {
        // Log and swallow error so WhatsApp failures never block other channels or business transactions
        this.logger.error('Failed to send WhatsApp notification to recipient', {
          userId,
          notificationType: payloadDto.type,
          template: templateConfig.template,
          step: 'dispatch_failed',
          err: serializeError(err),
        });
      }
    }
  }

  /**
   * Resolves and decrypts the primary verified phone numbers for the provided user IDs.
   * Checks AuthCredential (type=PHONE) and fallback Identity (type=PHONE).
   *
   * @param userIds - List of user IDs.
   * @returns Map of userId -> E.164 digits-only string without "+" (e.g. "919876543210").
   */
  private async resolveUserPhoneNumbers(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const phoneMap = new Map<string, string>();

    // 1. Query via AuthCredential (type=PHONE)
    const credentials = await this.prisma.authCredential.findMany({
      where: {
        userId: { in: userIds },
        type: AuthCredentialType.PHONE,
        deletedAt: null,
      },
      include: {
        identity: {
          select: {
            publicValueCiphertext: true,
            publicValueIv: true,
            publicValueTag: true,
            publicValueWrappedKey: true,
            publicValueKeyId: true,
          },
        },
      },
    });

    for (const cred of credentials) {
      if (!cred.identity) continue;

      try {
        const rawPhone = await this.identityCryptoService.decryptPublicValue(
          cred.identity,
        );
        const formatted = this.formatToDigitsOnlyE164(rawPhone);
        if (formatted) {
          phoneMap.set(cred.userId, formatted);
        }
      } catch (err) {
        this.logger.warn('Failed to decrypt user phone from AuthCredential', {
          userId: cred.userId,
          step: 'decrypt_phone_credential',
          err: serializeError(err),
        });
      }
    }

    // 2. Fallback: Query Identity records for any remaining users without a resolved phone
    const remainingUserIds = userIds.filter((id) => !phoneMap.has(id));
    if (remainingUserIds.length > 0) {
      const identities = await this.prisma.identity.findMany({
        where: {
          userId: { in: remainingUserIds },
          type: IdentityType.PHONE,
          isVerified: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          publicValueCiphertext: true,
          publicValueIv: true,
          publicValueTag: true,
          publicValueWrappedKey: true,
          publicValueKeyId: true,
        },
      });

      for (const identity of identities) {
        if (!identity.userId || phoneMap.has(identity.userId)) continue;

        try {
          const rawPhone = await this.identityCryptoService.decryptPublicValue({
            publicValueCiphertext: identity.publicValueCiphertext,
            publicValueIv: identity.publicValueIv,
            publicValueTag: identity.publicValueTag,
            publicValueWrappedKey: identity.publicValueWrappedKey,
            publicValueKeyId: identity.publicValueKeyId,
          });
          const formatted = this.formatToDigitsOnlyE164(rawPhone);
          if (formatted) {
            phoneMap.set(identity.userId, formatted);
          }
        } catch (err) {
          this.logger.warn('Failed to decrypt user phone from Identity', {
            userId: identity.userId,
            step: 'decrypt_phone_identity',
            err: serializeError(err),
          });
        }
      }
    }

    return phoneMap;
  }

  /**
   * Normalizes a decrypted phone string into ITU-T E.164 digits-only format without "+".
   * Example: "+91 98765 43210" or "919876543210" -> "919876543210".
   */
  private formatToDigitsOnlyE164(rawPhone: string | null): string | null {
    if (!rawPhone || rawPhone.trim() === '') return null;

    const trimmed = rawPhone.trim();

    try {
      const candidate = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
      const parsed = parsePhoneNumberWithError(candidate);
      if (parsed.isValid()) {
        return `${parsed.countryCallingCode}${parsed.nationalNumber}`;
      }
    } catch {
      // libphonenumber parsing failed, fall back to pure digits sanitization
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    return digitsOnly.length >= 7 ? digitsOnly : null;
  }

  /**
   * Checks if an idempotency key was already marked sent.
   * If not, marks it as sent with TTL and returns false.
   *
   * @param key - Idempotency key (e.g. whatsapp:match:{matchId}:{userId}).
   * @returns true if already sent (duplicate), false if new.
   */
  private async isDuplicateAndMark(key: string): Promise<boolean> {
    if (this.redisClient) {
      try {
        const result = await this.redisClient.set(
          key,
          '1',
          'EX',
          this.DEDUP_TTL_SECONDS,
          'NX',
        );
        // If NX was set, result is 'OK' (meaning it was not duplicate)
        return result !== 'OK';
      } catch (err) {
        this.logger.warn(
          'Redis deduplication check failed, falling back to in-memory cache',
          {
            key,
            step: 'redis_dedup_fallback',
            err: serializeError(err),
          },
        );
      }
    }

    // In-memory fallback
    const now = DateUtil.now().getTime();
    const existing = this.inMemorySentKeys.get(key);
    if (existing && now - existing < this.DEDUP_TTL_MS) {
      return true;
    }

    this.inMemorySentKeys.set(key, now);
    return false;
  }
}
