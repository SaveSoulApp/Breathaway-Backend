import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionEventType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { AppleSubscriptionService } from '../services/apple-subscription.service';

describe('AppleSubscriptionService', () => {
  let service: AppleSubscriptionService;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleSubscriptionService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AppleSubscriptionService>(AppleSubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const encodePayload = (payload: any): string => {
    const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `header.${base64}.signature`;
  };

  describe('parseNotification', () => {
    it('should correctly parse and decode outer and nested JWS payloads', () => {
      // Arrange
      const transactionInfo = {
        originalTransactionId: 'orig-tx-123',
        transactionId: 'tx-123',
        productId: 'prod-premium',
        purchaseDate: 1719568800000,
        expiresDate: 1722160800000,
        currency: 'USD',
        price: 9990,
        storefront: 'USA',
      };

      const renewalInfo = {
        autoRenewProductId: 'prod-premium',
        autoRenewStatus: 1,
      };

      const outerPayload = {
        notificationType: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        data: {
          signedTransactionInfo: encodePayload(transactionInfo),
          signedRenewalInfo: encodePayload(renewalInfo),
        },
      };

      const signedPayload = encodePayload(outerPayload);

      // Act
      const result = service.parseNotification(signedPayload);

      // Assert
      expect(result).toEqual({
        notificationType: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        transactionInfo,
        renewalInfo,
        rawPayload: outerPayload,
      });
    });

    it('should return empty objects for transactionInfo and renewalInfo if missing from outer payload', () => {
      // Arrange
      const outerPayload = {
        notificationType: 'EXPIRED',
        subtype: 'VOLUNTARY',
      };

      const signedPayload = encodePayload(outerPayload);

      // Act
      const result = service.parseNotification(signedPayload);

      // Assert
      expect(result).toEqual({
        notificationType: 'EXPIRED',
        subtype: 'VOLUNTARY',
        transactionInfo: {},
        renewalInfo: {},
        rawPayload: outerPayload,
      });
    });

    it('should warn and return empty payload if JWS is invalid', () => {
      // Arrange
      const invalidJws = 'invalidJwsStringNoDots';

      // Act
      const result = service.parseNotification(invalidJws);

      // Assert
      expect(result.notificationType).toBeUndefined();
      expect(mockLoggerService.forContext().warn).toHaveBeenCalledWith(
        'Invalid JWS format: expected 3 parts separated by dots',
        { step: 'decode_jws' },
      );
    });
  });

  describe('mapNotificationType', () => {
    const cases = [
      {
        type: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        expected: SubscriptionEventType.INITIAL_PURCHASE,
      },
      {
        type: 'SUBSCRIBED',
        subtype: 'AUTO_RENEW_ENABLED',
        expected: SubscriptionEventType.RENEWAL,
      },
      {
        type: 'SUBSCRIBED',
        subtype: undefined,
        expected: SubscriptionEventType.RENEWAL,
      },
      {
        type: 'DID_RENEW',
        subtype: undefined,
        expected: SubscriptionEventType.RENEWAL,
      },
      {
        type: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_DISABLED',
        expected: SubscriptionEventType.CANCELLATION,
      },
      {
        type: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_ENABLED',
        expected: SubscriptionEventType.BILLING_RECOVERY,
      },
      {
        type: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'UNKNOWN',
        expected: SubscriptionEventType.CANCELLATION,
      },
      {
        type: 'GRACE_PERIOD_EXPIRED',
        subtype: undefined,
        expected: SubscriptionEventType.EXPIRY,
      },
      {
        type: 'DID_FAIL_TO_RENEW',
        subtype: undefined,
        expected: SubscriptionEventType.GRACE_PERIOD_ENTERED,
      },
      {
        type: 'REVOKE',
        subtype: undefined,
        expected: SubscriptionEventType.REVOCATION,
      },
      {
        type: 'REFUND',
        subtype: undefined,
        expected: SubscriptionEventType.REFUND,
      },
      {
        type: 'PRICE_INCREASE',
        subtype: 'ACCEPTED',
        expected: SubscriptionEventType.PRICE_CHANGE_CONFIRMED,
      },
      {
        type: 'PRICE_INCREASE',
        subtype: undefined,
        expected: SubscriptionEventType.PRICE_CHANGE_CONFIRMED,
      },
      {
        type: 'EXPIRED',
        subtype: undefined,
        expected: SubscriptionEventType.EXPIRY,
      },
      {
        type: 'UNKNOWN_TYPE',
        subtype: undefined,
        expected: SubscriptionEventType.EXPIRY,
      },
    ];

    cases.forEach(({ type, subtype, expected }) => {
      it(`should map notificationType="${type}" and subtype="${subtype}" to eventType="${expected}"`, () => {
        const result = service.mapNotificationType(type, subtype);
        expect(result).toBe(expected);
      });
    });
  });
});
