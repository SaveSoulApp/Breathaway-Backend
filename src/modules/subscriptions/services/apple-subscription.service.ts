import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionEventType } from '@prisma/client';

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

interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  transactionInfo: AppleTransactionInfo;
  renewalInfo: AppleRenewalInfo;
  rawPayload: Record<string, unknown>;
}

@Injectable()
export class AppleSubscriptionService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
  }

  parseNotification(signedPayload: string): AppleNotificationPayload {
    const outerPayload = this.decodeJwsPayload(signedPayload);

    const transactionInfo: AppleTransactionInfo = outerPayload.data
      ?.signedTransactionInfo
      ? this.decodeJwsPayload(outerPayload.data.signedTransactionInfo)
      : ({} as AppleTransactionInfo);

    const renewalInfo: AppleRenewalInfo = outerPayload.data?.signedRenewalInfo
      ? this.decodeJwsPayload(outerPayload.data.signedRenewalInfo)
      : ({} as AppleRenewalInfo);

    return {
      notificationType: outerPayload.notificationType,
      subtype: outerPayload.subtype,
      transactionInfo,
      renewalInfo,
      rawPayload: outerPayload,
    };
  }

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
        this.logger.warn(
          `Unmapped Apple notification type: ${notificationType} (subtype: ${subtype}). Defaulting to EXPIRY.`,
        );
        return SubscriptionEventType.EXPIRY;
    }
  }

  private decodeJwsPayload(jws: string): any {
    const parts = jws.split('.');

    if (parts.length !== 3) {
      this.logger.warn(
        'Invalid JWS format: expected 3 parts separated by dots',
      );
      return {};
    }

    const payload = parts[1];

    // Base64url → Base64 conversion
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf-8');

    return JSON.parse(json);
  }
}
