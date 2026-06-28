import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionEventType } from '@prisma/client';
import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

interface GoogleNotificationRaw {
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
}

interface GoogleSubscriptionNotification {
  version: string;
  notificationType: number;
  purchaseToken: string;
  subscriptionId: string;
}

interface GoogleNotificationPayload {
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification: GoogleSubscriptionNotification;
}

interface GooglePurchaseDetails {
  kind: string;
  startTime: string;
  expiryTime: string;
  autoRenewing: boolean;
  priceCurrencyCode?: string;
  priceAmountMicros?: string;
  countryCode?: string;
  acknowledgementState?: number;
  cancelReason?: number;
}

/**
 * Integrates with Google Play Developer API and Real-Time Developer Notifications.
 *
 * Handles parsing base64-encoded Pub/Sub messages from Google and querying the
 * Google Play API to fetch authoritative purchase details for verification and
 * event processing.
 */
@Injectable()
export class GoogleSubscriptionService extends BaseService {
  private readonly googleAuth: GoogleAuth;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);

    this.googleAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
  }

  /**
   * Decodes a base64-encoded Google Play Developer Notification.
   *
   * @param base64Data - The encoded string received from Google Pub/Sub.
   * @returns The parsed JSON object representing the notification.
   */
  parseNotification(base64Data: string): GoogleNotificationPayload {
    const json = Buffer.from(base64Data, 'base64').toString('utf-8');
    const data = JSON.parse(json) as GoogleNotificationRaw;

    return {
      packageName: data.packageName ?? '',
      eventTimeMillis: data.eventTimeMillis ?? '',
      subscriptionNotification: {
        version: data.subscriptionNotification?.version ?? '',
        notificationType: data.subscriptionNotification?.notificationType ?? 0,
        purchaseToken: data.subscriptionNotification?.purchaseToken ?? '',
        subscriptionId: data.subscriptionNotification?.subscriptionId ?? '',
      },
    };
  }

  /**
   * Fetches authoritative subscription details directly from the Google Play API.
   *
   * Since Google notifications don't contain full transaction data, we must query
   * their API using the purchase token to get current state, price, and expiration.
   *
   * @param packageName - The Android package identifier (e.g., com.example.app).
   * @param subscriptionId - The Google Play product ID.
   * @param purchaseToken - The unique token identifying the purchase.
   * @returns The full purchase state and details.
   * @throws {Error} When the Google API request fails (e.g., invalid token).
   */
  async verifyPurchase(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<GooglePurchaseDetails> {
    try {
      const client = await this.googleAuth.getClient();
      const accessToken = await client.getAccessToken();

      const url =
        `https://androidpublisher.googleapis.com/androidpublisher/v3` +
        `/applications/${packageName}` +
        `/purchases/subscriptionsv2/tokens/${purchaseToken}`;

      const response = await axios.get<GooglePurchaseDetails>(url, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.warn(
        `Failed to verify Google purchase for package "${packageName}", ` +
          `subscription "${subscriptionId}": ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Maps a Google Play notification integer code to a unified SubscriptionEventType.
   *
   * Used to standardize disparate store events into our internal billing lifecycle.
   *
   * @param notificationType - The integer code defined by Google.
   * @returns The corresponding internal event type.
   */
  mapNotificationType(notificationType: number): SubscriptionEventType {
    switch (notificationType) {
      case 1: // SUBSCRIPTION_RECOVERED
        return SubscriptionEventType.BILLING_RECOVERY;

      case 2: // SUBSCRIPTION_RENEWED
        return SubscriptionEventType.RENEWAL;

      case 3: // SUBSCRIPTION_CANCELED
        return SubscriptionEventType.CANCELLATION;

      case 4: // SUBSCRIPTION_PURCHASED
        return SubscriptionEventType.INITIAL_PURCHASE;

      case 5: // SUBSCRIPTION_ON_HOLD
        return SubscriptionEventType.GRACE_PERIOD_ENTERED;

      case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
        return SubscriptionEventType.GRACE_PERIOD_ENTERED;

      case 7: // SUBSCRIPTION_RESTARTED
        return SubscriptionEventType.BILLING_RECOVERY;

      case 8: // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
        return SubscriptionEventType.PRICE_CHANGE_CONFIRMED;

      case 9: // SUBSCRIPTION_DEFERRED
        return SubscriptionEventType.RENEWAL;

      case 12: // SUBSCRIPTION_REVOKED
        return SubscriptionEventType.REVOCATION;

      case 13: // SUBSCRIPTION_EXPIRED
        return SubscriptionEventType.EXPIRY;

      default:
        this.logger.warn(
          `Unmapped Google notification type: ${notificationType}. Defaulting to EXPIRY.`,
        );
        return SubscriptionEventType.EXPIRY;
    }
  }
}
