import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Device } from '@prisma/client';
import Redis from 'ioredis';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { maskPhoneNumber } from '@common/utils/phone.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { NotificationRecipientResolverService } from '../recipient/notification-recipient-resolver.service';
import {
  type IWhatsAppAdapter,
  WHATSAPP_ADAPTER_TOKEN,
} from '../whatsapp/adapters/whatsapp-adapter.interface';
import { WHATSAPP_TEMPLATE_MAP } from '../whatsapp/whatsapp-template.registry';
import { INotificationProvider } from './notification-provider.interface';

/**
 * Service responsible for orchestrating WhatsApp notification dispatch:
 * 1. Resolves recipient user phone numbers via NotificationRecipientResolverService.
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
    private readonly recipientResolver: NotificationRecipientResolverService,
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

    const phoneContactsByUser =
      await this.recipientResolver.resolvePhoneNumbers(payloadDto.userIds);

    if (phoneContactsByUser.size === 0) {
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
      const recipientContact = phoneContactsByUser.get(userId);
      if (!recipientContact) {
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
          to: recipientContact.phoneDigits,
          template: templateConfig.template,
          language: templateConfig.language,
          params: extraParams,
        });

        this.logger.log(
          'WhatsApp notification sent successfully to recipient',
          {
            userId,
            recipient: maskPhoneNumber(recipientContact.phoneDigits),
            notificationType: payloadDto.type,
            template: templateConfig.template,
            step: 'dispatch_success',
          },
        );
      } catch (err) {
        // Log and swallow error so WhatsApp failures never block other channels or business transactions
        this.logger.error('Failed to send WhatsApp notification to recipient', {
          userId,
          recipient: maskPhoneNumber(recipientContact.phoneDigits),
          notificationType: payloadDto.type,
          template: templateConfig.template,
          step: 'dispatch_failed',
          err: serializeError(err),
        });
      }
    }
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
