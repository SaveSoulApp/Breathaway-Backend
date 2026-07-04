import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionEventType } from '@prisma/client';
import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { GoogleSubscriptionService } from '../services/google-subscription.service';

jest.mock('axios');
jest.mock('google-auth-library', () => {
  return {
    GoogleAuth: jest.fn().mockImplementation(() => {
      return {
        getClient: jest.fn().mockResolvedValue({
          getAccessToken: jest
            .fn()
            .mockResolvedValue({ token: 'mock-google-token' }),
        }),
      };
    }),
  };
});

describe('GoogleSubscriptionService', () => {
  let service: GoogleSubscriptionService;
  const mockedAxios = axios as jest.Mocked<typeof axios>;

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
        GoogleSubscriptionService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<GoogleSubscriptionService>(GoogleSubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseNotification', () => {
    it('should base64 decode and parse a valid Google Play subscription notification', () => {
      // Arrange
      const rawData = {
        packageName: 'com.breathaway.app',
        eventTimeMillis: '1719568800000',
        subscriptionNotification: {
          version: '1.0',
          notificationType: 4,
          purchaseToken: 'token-abc-123',
          subscriptionId: 'sub-premium-monthly',
        },
      };

      const base64Data = Buffer.from(JSON.stringify(rawData)).toString(
        'base64',
      );

      // Act
      const result = service.parseNotification(base64Data);

      // Assert
      expect(result).toEqual({
        packageName: 'com.breathaway.app',
        eventTimeMillis: '1719568800000',
        subscriptionNotification: {
          version: '1.0',
          notificationType: 4,
          purchaseToken: 'token-abc-123',
          subscriptionId: 'sub-premium-monthly',
        },
      });
    });

    it('should return empty/default values when raw fields are missing', () => {
      // Arrange
      const rawData = {};
      const base64Data = Buffer.from(JSON.stringify(rawData)).toString(
        'base64',
      );

      // Act
      const result = service.parseNotification(base64Data);

      // Assert
      expect(result).toEqual({
        packageName: '',
        eventTimeMillis: '',
        subscriptionNotification: {
          version: '',
          notificationType: 0,
          purchaseToken: '',
          subscriptionId: '',
        },
      });
    });
  });

  describe('verifyPurchase', () => {
    it('should request Android Publisher API using google-auth-library client and return purchase details', async () => {
      // Arrange
      const mockPurchaseDetails = {
        kind: 'androidpublisher#subscriptionPurchaseV2',
        startTime: '2026-06-28T00:00:00Z',
        expiryTime: '2026-07-28T00:00:00Z',
        autoRenewing: true,
        priceCurrencyCode: 'USD',
        priceAmountMicros: '9990000',
        countryCode: 'US',
        acknowledgementState: 1,
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockPurchaseDetails });

      // Act
      const result = await service.verifyPurchase(
        'com.breathaway.app',
        'sub-premium-monthly',
        'token-abc-123',
      );

      // Assert
      expect(result).toEqual(mockPurchaseDetails);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.breathaway.app/purchases/subscriptionsv2/tokens/token-abc-123',
        {
          headers: {
            Authorization: 'Bearer mock-google-token',
          },
        },
      );
    });

    it('should log a warning and throw the error if the Axios request fails', async () => {
      // Arrange
      const mockError = new Error('API Request Failed');
      mockedAxios.get.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(
        service.verifyPurchase(
          'com.breathaway.app',
          'sub-premium-monthly',
          'token-abc-123',
        ),
      ).rejects.toThrow('API Request Failed');

      expect(mockLoggerService.forContext().error).toHaveBeenCalledWith(
        'Failed to verify Google purchase',
        expect.objectContaining({
          packageName: 'com.breathaway.app',
          subscriptionId: 'sub-premium-monthly',
          step: 'verify_purchase',
          err: expect.objectContaining({ message: 'API Request Failed' }),
        }),
      );
    });
  });

  describe('mapNotificationType', () => {
    const cases = [
      { code: 1, expected: SubscriptionEventType.BILLING_RECOVERY },
      { code: 2, expected: SubscriptionEventType.RENEWAL },
      { code: 3, expected: SubscriptionEventType.CANCELLATION },
      { code: 4, expected: SubscriptionEventType.INITIAL_PURCHASE },
      { code: 5, expected: SubscriptionEventType.GRACE_PERIOD_ENTERED },
      { code: 6, expected: SubscriptionEventType.GRACE_PERIOD_ENTERED },
      { code: 7, expected: SubscriptionEventType.BILLING_RECOVERY },
      { code: 8, expected: SubscriptionEventType.PRICE_CHANGE_CONFIRMED },
      { code: 9, expected: SubscriptionEventType.RENEWAL },
      { code: 12, expected: SubscriptionEventType.REVOCATION },
      { code: 13, expected: SubscriptionEventType.EXPIRY },
      { code: 99, expected: SubscriptionEventType.EXPIRY }, // default fallback
    ];

    cases.forEach(({ code, expected }) => {
      it(`should map notificationType code=${code} to eventType="${expected}"`, () => {
        const result = service.mapNotificationType(code);
        expect(result).toBe(expected);
      });
    });
  });
});
