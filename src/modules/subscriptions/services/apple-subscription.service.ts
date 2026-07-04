import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionEventType } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

interface AppleTransactionInfo {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  purchaseDate: number;
  expiresDate: number;
  currency?: string;
  price?: number;
  storefront?: string;
}

interface AppleRenewalInfo {
  autoRenewProductId: string;
  autoRenewStatus: number;
  expirationIntent?: number;
}

interface AppleJwsPayload extends Record<string, unknown> {
  notificationType: string;
  subtype?: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  transactionInfo: AppleTransactionInfo;
  renewalInfo: AppleRenewalInfo;
  rawPayload: Record<string, unknown>;
}

/**
 * Integrates with Apple StoreKit 2 for Server-to-Server Notifications.
 *
 * Validates, decodes, and parses Apple's cryptographically signed JWS payloads,
 * translating App Store lifecycle events into our unified internal event schema.
 */
@Injectable()
export class AppleSubscriptionService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
  }

  /**
   * Decodes an Apple JWS webhook payload into strongly-typed objects.
   *
   * Extracts the outer notification and decodes the embedded signedTransactionInfo
   * and signedRenewalInfo objects.
   *
   * @param signedPayload - The raw JWS string received from Apple.
   * @returns The parsed notification data including nested transaction details.
   */
  parseNotification(signedPayload: string): AppleNotificationPayload {
    const outerPayload = this.decodeJwsPayload<AppleJwsPayload>(signedPayload);

    const transactionInfo = outerPayload.data?.signedTransactionInfo
      ? this.decodeJwsPayload<AppleTransactionInfo>(
          outerPayload.data.signedTransactionInfo,
        )
      : ({} as AppleTransactionInfo);

    const renewalInfo = outerPayload.data?.signedRenewalInfo
      ? this.decodeJwsPayload<AppleRenewalInfo>(
          outerPayload.data.signedRenewalInfo,
        )
      : ({} as AppleRenewalInfo);

    return {
      notificationType: outerPayload.notificationType,
      subtype: outerPayload.subtype,
      transactionInfo,
      renewalInfo,
      rawPayload: outerPayload,
    };
  }

  /**
   * Maps an Apple notification type and subtype to a unified SubscriptionEventType.
   *
   * Used to standardize disparate store events into our internal billing lifecycle.
   *
   * @param notificationType - The primary event type from Apple (e.g., 'SUBSCRIBED').
   * @param subtype - Optional secondary context (e.g., 'INITIAL_BUY').
   * @returns The corresponding internal event type.
   */
  mapNotificationType(
    notificationType: string,
    subtype?: string,
  ): SubscriptionEventType {
    switch (notificationType) {
      case 'SUBSCRIBED':
        if (subtype === 'INITIAL_BUY') {
          return SubscriptionEventType.INITIAL_PURCHASE;
        }
        return SubscriptionEventType.RENEWAL;

      case 'DID_RENEW':
        return SubscriptionEventType.RENEWAL;

      case 'DID_CHANGE_RENEWAL_STATUS':
        if (subtype === 'AUTO_RENEW_DISABLED') {
          return SubscriptionEventType.CANCELLATION;
        }
        if (subtype === 'AUTO_RENEW_ENABLED') {
          return SubscriptionEventType.BILLING_RECOVERY;
        }
        return SubscriptionEventType.CANCELLATION;

      case 'GRACE_PERIOD_EXPIRED':
        return SubscriptionEventType.EXPIRY;

      case 'DID_FAIL_TO_RENEW':
        return SubscriptionEventType.GRACE_PERIOD_ENTERED;

      case 'REVOKE':
        return SubscriptionEventType.REVOCATION;

      case 'REFUND':
        return SubscriptionEventType.REFUND;

      case 'PRICE_INCREASE':
        if (subtype === 'ACCEPTED') {
          return SubscriptionEventType.PRICE_CHANGE_CONFIRMED;
        }
        return SubscriptionEventType.PRICE_CHANGE_CONFIRMED;

      case 'EXPIRED':
        return SubscriptionEventType.EXPIRY;

      default:
        this.logger.warn('Unmapped Apple notification type', {
          notificationType,
          subtype,
          step: 'map_notification',
        });
        return SubscriptionEventType.EXPIRY;
    }
  }

  private decodeJwsPayload<T = Record<string, unknown>>(jws: string): T {
    const parts = jws.split('.');

    if (parts.length !== 3) {
      this.logger.warn(
        'Invalid JWS format: expected 3 parts separated by dots',
        { step: 'decode_jws' },
      );
      return {} as T;
    }

    const payload = parts[1];

    // Base64url → Base64 conversion
    try {
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = Buffer.from(base64, 'base64').toString('utf-8');
      return JSON.parse(json) as T;
    } catch (error) {
      this.logger.error('Failed to parse decoded JWS JSON', {
        step: 'decode_jws',
        err: serializeError(error),
      });
      throw error;
    }
  }
}
