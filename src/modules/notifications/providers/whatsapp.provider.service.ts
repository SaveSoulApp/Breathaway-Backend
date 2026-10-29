import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Device } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { maskPhoneNumber } from '@common/utils/phone.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { RedisService } from '@infrastructure/redis';

import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { NotificationType } from '../enums/notification-type.enum';
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
  static readonly MAX_IN_MEMORY_KEYS = 5000;
  private readonly inMemorySentKeys = new Map<string, number>();
  private readonly DEDUP_TTL_SECONDS = 24 * 60 * 60; // 24 hours (1 day)
  private readonly DEDUP_TTL_MS = this.DEDUP_TTL_SECONDS * 1000;

  constructor(
    loggerService: LoggerService,
    private readonly recipientResolver: NotificationRecipientResolverService,
    @Inject(WHATSAPP_ADAPTER_TOKEN)
    private readonly whatsAppAdapter: IWhatsAppAdapter,
    @Optional()
    private readonly redisService?: RedisService,
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

    const extraParams = templateConfig.buildPayload
      ? templateConfig.buildPayload(payloadDto.payload ?? {})
      : undefined;

    const matchId =
      (payloadDto.payload?.matchId as string | undefined) ||
      (payloadDto.link?.startsWith('/matches/')
        ? payloadDto.link.replace('/matches/', '')
        : undefined);

    await Promise.allSettled(
      payloadDto.userIds.map(async (userId) => {
        const recipientContact = phoneContactsByUser.get(userId);
        if (!recipientContact) {
          return;
        }

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
            return;
          }
        }

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
          this.logger.error(
            'Failed to send WhatsApp notification to recipient',
            {
              userId,
              recipient: maskPhoneNumber(recipientContact.phoneDigits),
              notificationType: payloadDto.type,
              template: templateConfig.template,
              step: 'dispatch_failed',
              err: serializeError(err),
            },
          );
        }
      }),
    );
  }

  /**
   * Dispatches a WhatsApp notification directly to a phone number.
   *
   * Resolves template configurations from WHATSAPP_TEMPLATE_MAP, interpolates parameters,
   * enforces deduplication / rate-limiting buffers, and safely handles errors.
   *
   * @param options - Direct phone dispatch parameters
   * @returns boolean - True if the message was dispatched; false if skipped, suppressed, or failed.
   */
  async sendDirectPhone(options: {
    to: string;
    type: NotificationType;
    params?: Record<string, unknown>;
    language?: string;
    dedupKey?: string;
    dedupTtlSeconds?: number;
  }): Promise<boolean> {
    const {
      to,
      type,
      params,
      language = 'en',
      dedupKey,
      dedupTtlSeconds,
    } = options;

    if (!to || to.trim() === '') {
      this.logger.warn(
        'Cannot send direct WhatsApp message: phone number is empty',
        {
          type,
          step: 'validate_phone',
        },
      );
      return false;
    }

    const templateConfig = WHATSAPP_TEMPLATE_MAP[type];
    if (!templateConfig) {
      this.logger.debug(
        'No WhatsApp template mapped for notification type in direct phone send',
        {
          type,
          step: 'template_lookup',
        },
      );
      return false;
    }

    // Cooldown / deduplication check
    if (dedupKey) {
      const isDuplicate = await this.isDuplicateAndMark(
        dedupKey,
        dedupTtlSeconds,
      );
      if (isDuplicate) {
        this.logger.log(
          'Direct WhatsApp notification suppressed due to active deduplication / cooldown buffer',
          {
            recipient: maskPhoneNumber(to),
            type,
            template: templateConfig.template,
            dedupKey,
            step: 'dedup_check',
          },
        );
        return false;
      }
    }

    const payloadParams = templateConfig.buildPayload
      ? templateConfig.buildPayload(params ?? {})
      : params;

    try {
      await this.whatsAppAdapter.send({
        to,
        template: templateConfig.template,
        language: templateConfig.language ?? language,
        params: payloadParams,
      });

      this.logger.log('Direct WhatsApp notification dispatched successfully', {
        recipient: maskPhoneNumber(to),
        type,
        template: templateConfig.template,
        step: 'dispatch_success',
      });
      return true;
    } catch (err) {
      // If send failed and a dedupKey was used, release the key so subsequent attempts aren't falsely blocked
      if (dedupKey) {
        await this.releaseDuplicateKey(dedupKey);
      }

      this.logger.error('Failed to send direct WhatsApp notification', {
        recipient: maskPhoneNumber(to),
        type,
        template: templateConfig.template,
        step: 'dispatch_failed',
        err: serializeError(err),
      });
      return false;
    }
  }

  /**
   * Checks if an idempotency key was already marked sent.
   * If not, marks it as sent with TTL and returns false.
   *
   * @param key - Idempotency or cooldown key.
   * @param ttlSeconds - Optional TTL in seconds (defaults to DEDUP_TTL_SECONDS).
   * @returns true if already sent (duplicate/suppressed), false if new.
   */
  async isDuplicateAndMark(
    key: string,
    ttlSeconds: number = this.DEDUP_TTL_SECONDS,
  ): Promise<boolean> {
    if (this.redisService?.isConfigured) {
      try {
        const result = await this.redisService.set(
          key,
          '1',
          'EX',
          ttlSeconds,
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
    const ttlMs = ttlSeconds * 1000;
    const now = DateUtil.now().getTime();
    const existing = this.inMemorySentKeys.get(key);
    if (existing && now - existing < ttlMs) {
      return true;
    }

    this.pruneInMemoryCache(now);
    this.inMemorySentKeys.set(key, now);
    return false;
  }

  /**
   * Releases an idempotency / cooldown key in case of dispatch failure.
   */
  async releaseDuplicateKey(key: string): Promise<void> {
    if (this.redisService?.isConfigured) {
      try {
        await this.redisService.rawClient?.del(key);
      } catch (err) {
        this.logger.warn(
          'Failed to release Redis deduplication key on failure',
          {
            key,
            step: 'redis_release_error',
            err: serializeError(err),
          },
        );
      }
    }
    this.inMemorySentKeys.delete(key);
  }

  /**
   * Prunes expired keys and enforces a maximum size ceiling on the in-memory cache
   * to prevent memory leaks in stateless containers when Redis is unreachable.
   */
  private pruneInMemoryCache(now: number): void {
    if (
      this.inMemorySentKeys.size < WhatsAppProviderService.MAX_IN_MEMORY_KEYS
    ) {
      return;
    }

    // 1. Evict all expired entries
    const cutoff = now - this.DEDUP_TTL_MS;
    for (const [k, timestamp] of this.inMemorySentKeys.entries()) {
      if (timestamp <= cutoff) {
        this.inMemorySentKeys.delete(k);
      }
    }

    // 2. If still over capacity after expiry pruning, evict oldest 20% entries (FIFO)
    if (
      this.inMemorySentKeys.size >= WhatsAppProviderService.MAX_IN_MEMORY_KEYS
    ) {
      const keysToEvictCount = Math.floor(
        WhatsAppProviderService.MAX_IN_MEMORY_KEYS * 0.2,
      );
      let evicted = 0;
      for (const k of this.inMemorySentKeys.keys()) {
        if (evicted >= keysToEvictCount) {
          break;
        }
        this.inMemorySentKeys.delete(k);
        evicted++;
      }
    }
  }
}
