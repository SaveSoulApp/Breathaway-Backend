import { Test, TestingModule } from '@nestjs/testing';
import {
  CurrencyCode,
  StorePlatform,
  SubscriptionEventType,
} from '@prisma/client';

import { LoggerService } from '@core/logger';

import { AppleSubscriptionService } from '../services/apple-subscription.service';
import { GoogleSubscriptionService } from '../services/google-subscription.service';
import { SubscriptionsService } from '../services/subscriptions.service';
import { SubscriptionsWebhookController } from '../subscriptions-webhook.controller';

describe('SubscriptionsWebhookController', () => {
  let controller: SubscriptionsWebhookController;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;
  let appleService: jest.Mocked<AppleSubscriptionService>;
  let googleService: jest.Mocked<GoogleSubscriptionService>;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };

  beforeEach(async () => {
    const mockSubscriptionsService = {
      findSubscriptionByStoreTransaction: jest.fn(),
      handleRenewal: jest.fn(),
      handleCancellation: jest.fn(),
      handleGracePeriod: jest.fn(),
      handleBillingRecovery: jest.fn(),
      handleRevocation: jest.fn(),
      handleExpiry: jest.fn(),
    };

    const mockAppleService = {
      parseNotification: jest.fn(),
      mapNotificationType: jest.fn(),
    };

    const mockGoogleService = {
      parseNotification: jest.fn(),
      mapNotificationType: jest.fn(),
      verifyPurchase: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsWebhookController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: SubscriptionsService, useValue: mockSubscriptionsService },
        { provide: AppleSubscriptionService, useValue: mockAppleService },
        { provide: GoogleSubscriptionService, useValue: mockGoogleService },
      ],
    }).compile();

    controller = module.get<SubscriptionsWebhookController>(
      SubscriptionsWebhookController,
    );
    subscriptionsService = module.get(SubscriptionsService);
    appleService = module.get(AppleSubscriptionService);
    googleService = module.get(GoogleSubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleAppleNotification', () => {
    const appleDto = { signedPayload: 'mock-signed-jws-payload' };

    it('should successfully parse JWS, resolve currency, route event to handleRenewal, and return status ok', async () => {
      // Arrange
      const mockNotification = {
        notificationType: 'DID_RENEW',
        subtype: undefined,
        transactionInfo: {
          originalTransactionId: 'orig-tx-123',
          transactionId: 'tx-123',
          productId: 'premium-monthly',
          purchaseDate: 1719568800000,
          expiresDate: 1722160800000,
          currency: 'USD',
          price: 9990,
          storefront: 'USA',
        },
        renewalInfo: {
          autoRenewProductId: 'premium-monthly',
          autoRenewStatus: 1,
        },
        rawPayload: { outer: true },
      };

      appleService.parseNotification.mockReturnValue(mockNotification as any);
      appleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.RENEWAL,
      );
      subscriptionsService.handleRenewal.mockResolvedValue({
        id: 'sub-id',
      } as any);

      // Act
      const result = await controller.handleAppleNotification(appleDto);

      // Assert
      expect(result).toEqual({ status: 'ok' });
      expect(appleService.parseNotification).toHaveBeenCalledWith(
        'mock-signed-jws-payload',
      );
      expect(appleService.mapNotificationType).toHaveBeenCalledWith(
        'DID_RENEW',
        undefined,
      );
      expect(subscriptionsService.handleRenewal).toHaveBeenCalledWith({
        storeTransactionId: 'orig-tx-123',
        storePlatform: StorePlatform.APPLE,
        newPeriodStart: new Date(1719568800000),
        newPeriodEnd: new Date(1722160800000),
        rawPayload: { outer: true },
        storeEventId: 'tx-123',
      });
    });

    it('should log error and return status error if processing throws', async () => {
      // Arrange
      appleService.parseNotification.mockImplementation(() => {
        throw new Error('JWS Parse Fail');
      });

      // Act
      const result = await controller.handleAppleNotification(appleDto);

      // Assert
      expect(result).toEqual({ status: 'error' });
      expect(mockLoggerService.forContext().error).toHaveBeenCalledWith(
        'Failed to process Apple notification',
        { error: 'JWS Parse Fail' },
      );
    });

    it('should route INITIAL_PURCHASE to findSubscriptionByStoreTransaction and handle idempotency', async () => {
      // Arrange
      const mockNotification = {
        notificationType: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        transactionInfo: {
          originalTransactionId: 'orig-tx-123',
          transactionId: 'tx-123',
          productId: 'premium-monthly',
          purchaseDate: 1719568800000,
          expiresDate: 1722160800000,
        },
        rawPayload: {},
      };

      appleService.parseNotification.mockReturnValue(mockNotification as any);
      appleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.INITIAL_PURCHASE,
      );
      subscriptionsService.findSubscriptionByStoreTransaction.mockResolvedValue(
        { id: 'existing-sub' } as any,
      );

      // Act
      await controller.handleAppleNotification(appleDto);

      // Assert
      expect(
        subscriptionsService.findSubscriptionByStoreTransaction,
      ).toHaveBeenCalledWith('orig-tx-123');
    });

    it('should route CANCELLATION to handleCancellation', async () => {
      // Arrange
      const mockNotification = {
        notificationType: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_DISABLED',
        transactionInfo: { originalTransactionId: 'orig-tx-123' },
        rawPayload: {},
      };
      appleService.parseNotification.mockReturnValue(mockNotification as any);
      appleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.CANCELLATION,
      );

      // Act
      await controller.handleAppleNotification(appleDto);

      // Assert
      expect(subscriptionsService.handleCancellation).toHaveBeenCalledWith(
        expect.objectContaining({ storeTransactionId: 'orig-tx-123' }),
      );
    });

    it('should route GRACE_PERIOD_ENTERED to handleGracePeriod', async () => {
      // Arrange
      const mockNotification = {
        notificationType: 'DID_FAIL_TO_RENEW',
        transactionInfo: { originalTransactionId: 'orig-tx-123' },
        rawPayload: {},
      };
      appleService.parseNotification.mockReturnValue(mockNotification as any);
      appleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.GRACE_PERIOD_ENTERED,
      );

      // Act
      await controller.handleAppleNotification(appleDto);

      // Assert
      expect(subscriptionsService.handleGracePeriod).toHaveBeenCalledWith(
        expect.objectContaining({ storeTransactionId: 'orig-tx-123' }),
      );
    });

    it('should route BILLING_RECOVERY to handleBillingRecovery', async () => {
      // Arrange
      const mockNotification = {
        notificationType: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_ENABLED',
        transactionInfo: {
          originalTransactionId: 'orig-tx-123',
          expiresDate: 1722160800000,
        },
        rawPayload: {},
      };
      appleService.parseNotification.mockReturnValue(mockNotification as any);
      appleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.BILLING_RECOVERY,
      );

      // Act
      await controller.handleAppleNotification(appleDto);

      // Assert
      expect(subscriptionsService.handleBillingRecovery).toHaveBeenCalledWith(
        expect.objectContaining({
          storeTransactionId: 'orig-tx-123',
          newPeriodEnd: new Date(1722160800000),
        }),
      );
    });

    it('should route REVOCATION to handleRevocation', async () => {
      // Arrange
      const mockNotification = {
        notificationType: 'REVOKE',
        transactionInfo: { originalTransactionId: 'orig-tx-123' },
        rawPayload: {},
      };
      appleService.parseNotification.mockReturnValue(mockNotification as any);
      appleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.REVOCATION,
      );

      // Act
      await controller.handleAppleNotification(appleDto);

      // Assert
      expect(subscriptionsService.handleRevocation).toHaveBeenCalledWith(
        expect.objectContaining({ storeTransactionId: 'orig-tx-123' }),
      );
    });

    it('should route EXPIRY to handleExpiry', async () => {
      // Arrange
      const mockNotification = {
        notificationType: 'EXPIRED',
        transactionInfo: { originalTransactionId: 'orig-tx-123' },
        rawPayload: {},
      };
      appleService.parseNotification.mockReturnValue(mockNotification as any);
      appleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.EXPIRY,
      );

      // Act
      await controller.handleAppleNotification(appleDto);

      // Assert
      expect(subscriptionsService.handleExpiry).toHaveBeenCalledWith(
        'orig-tx-123',
        StorePlatform.APPLE,
      );
    });
  });

  describe('handleGoogleNotification', () => {
    const googleDto = {
      message: {
        data: 'mock-base64-pubsub-data',
        messageId: 'google-msg-id-111',
      },
      subscription: 'mock-subscription-topic',
    };

    it('should return ignored status if no subscriptionNotification is found', async () => {
      // Arrange
      googleService.parseNotification.mockReturnValue({
        packageName: 'com.breathaway.app',
        eventTimeMillis: '1719568800000',
      } as any);

      // Act
      const result = await controller.handleGoogleNotification(googleDto);

      // Assert
      expect(result).toEqual({ status: 'ignored' });
      expect(googleService.verifyPurchase).not.toHaveBeenCalled();
    });

    it('should return verification_failed if verifyPurchase throws', async () => {
      // Arrange
      const notification = {
        packageName: 'com.breathaway.app',
        subscriptionNotification: {
          subscriptionId: 'premium-monthly',
          purchaseToken: 'g-token-123',
          notificationType: 2,
        },
      };
      googleService.parseNotification.mockReturnValue(notification as any);
      googleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.RENEWAL,
      );
      googleService.verifyPurchase.mockRejectedValue(new Error('Auth failed'));

      // Act
      const result = await controller.handleGoogleNotification(googleDto);

      // Assert
      expect(result).toEqual({ status: 'verification_failed' });
      expect(mockLoggerService.forContext().warn).toHaveBeenCalledWith(
        'Failed to verify Google purchase — skipping event',
        { purchaseToken: 'g-token-123' },
      );
    });

    it('should successfully verify, resolve currency, route event to handleRenewal, and return status ok', async () => {
      // Arrange
      const notification = {
        packageName: 'com.breathaway.app',
        subscriptionNotification: {
          subscriptionId: 'premium-monthly',
          purchaseToken: 'g-token-123',
          notificationType: 2,
        },
      };
      const purchaseDetails = {
        kind: 'androidpublisher#subscriptionPurchaseV2',
        startTime: '2026-06-28T00:00:00Z',
        expiryTime: '2026-07-28T00:00:00Z',
        priceCurrencyCode: 'EUR',
        priceAmountMicros: '8990000',
        countryCode: 'FR',
      };

      googleService.parseNotification.mockReturnValue(notification as any);
      googleService.mapNotificationType.mockReturnValue(
        SubscriptionEventType.RENEWAL,
      );
      googleService.verifyPurchase.mockResolvedValue(purchaseDetails as any);
      subscriptionsService.handleRenewal.mockResolvedValue({
        id: 'sub-id',
      } as any);

      // Act
      const result = await controller.handleGoogleNotification(googleDto);

      // Assert
      expect(result).toEqual({ status: 'ok' });
      expect(googleService.verifyPurchase).toHaveBeenCalledWith(
        'com.breathaway.app',
        'premium-monthly',
        'g-token-123',
      );
      expect(subscriptionsService.handleRenewal).toHaveBeenCalledWith({
        storeTransactionId: 'g-token-123',
        storePlatform: StorePlatform.GOOGLE,
        newPeriodStart: new Date('2026-06-28T00:00:00Z'),
        newPeriodEnd: new Date('2026-07-28T00:00:00Z'),
        rawPayload: notification,
        storeEventId: 'google-msg-id-111',
      });
    });

    it('should log error and return status error if general processing fails', async () => {
      // Arrange
      googleService.parseNotification.mockImplementation(() => {
        throw new Error('Base64 error');
      });

      // Act
      const result = await controller.handleGoogleNotification(googleDto);

      // Assert
      expect(result).toEqual({ status: 'error' });
    });
  });
});
