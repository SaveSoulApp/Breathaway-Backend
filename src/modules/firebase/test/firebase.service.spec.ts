import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import * as admin from 'firebase-admin';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { FirebaseService } from '../firebase.service';

describe('FirebaseService', () => {
  let service: FirebaseService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    forContext: jest.fn().mockReturnThis(),
  };

  const mockAuth = {
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
  };

  const mockMessaging = {
    send: jest.fn(),
    sendEachForMulticast: jest.fn(),
  };

  const mockFirebaseApp = {
    name: 'test-firebase-app',
    auth: jest.fn().mockReturnValue(mockAuth),
    messaging: jest.fn().mockReturnValue(mockMessaging),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        FirebaseService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: 'FIREBASE_ADMIN_APP',
          useValue: mockFirebaseApp,
        },
      ],
    }).compile();

    service = module.get<FirebaseService>(FirebaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleDestroy', () => {
    it('should delete the firebase app instance', async () => {
      await service.onModuleDestroy();
      expect(mockFirebaseApp.delete).toHaveBeenCalled();
    });

    it('should handle app deletion errors without throwing', async () => {
      mockFirebaseApp.delete.mockRejectedValueOnce(new Error('Delete failed'));
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('getMessaging', () => {
    it('should return messaging instance', () => {
      const result = service.getMessaging();
      expect(result).toBe(mockMessaging);
      expect(mockFirebaseApp.messaging).toHaveBeenCalled();
    });
  });

  describe('verifyIdToken', () => {
    it('should verify valid token', async () => {
      const mockDecodedToken = {
        uid: 'test-uid',
        email: 'test@example.com',
      } as unknown as admin.auth.DecodedIdToken;
      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);

      const result = await service.verifyIdToken('valid-token');

      expect(result).toEqual(mockDecodedToken);
      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(service.verifyIdToken('invalid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid Firebase ID token'),
      );
    });
  });

  describe('getUser', () => {
    it('should get user by UID', async () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
      } as unknown as admin.auth.UserRecord;
      mockAuth.getUser.mockResolvedValue(mockUser);

      const result = await service.getUser('test-uid');

      expect(result).toEqual(mockUser);
      expect(mockAuth.getUser).toHaveBeenCalledWith('test-uid');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockAuth.getUser.mockRejectedValue(new Error('User not found'));

      await expect(service.getUser('non-existent-uid')).rejects.toThrow(
        new UnauthorizedException('Firebase user not found'),
      );
    });
  });

  describe('validateFirebaseToken', () => {
    const mockDecodedToken = {
      uid: 'test-uid',
      email: 'test@example.com',
      firebase: {
        sign_in_provider: 'password',
      },
    } as unknown as admin.auth.DecodedIdToken;

    it('should validate token with matching UID', async () => {
      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);

      const result = await service.validateFirebaseToken(
        'test-uid',
        'valid-token',
      );

      expect(result.decodedToken).toEqual(mockDecodedToken);
      expect(result.authMethod).toBeDefined();
      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('should validate token with context', async () => {
      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);

      const result = await service.validateFirebaseToken(
        'test-uid',
        'valid-token',
        'signup',
      );

      expect(result.decodedToken).toEqual(mockDecodedToken);
    });

    it('should throw UnauthorizedException for UID mismatch', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({
        ...mockDecodedToken,
        uid: 'different-uid',
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'valid-token'),
      ).rejects.toThrow(new UnauthorizedException('UID does not match token'));
    });

    it('should throw UnauthorizedException for UID mismatch with context', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({
        ...mockDecodedToken,
        uid: 'different-uid',
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'valid-token', 'signin'),
      ).rejects.toThrow(
        new UnauthorizedException('UID does not match token [signin]'),
      );
    });

    it('should handle expired token error', async () => {
      mockAuth.verifyIdToken.mockRejectedValue({
        errorInfo: { code: 'auth/id-token-expired' },
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'expired-token'),
      ).rejects.toThrow(
        new UnauthorizedException('Firebase ID token has expired'),
      );
    });

    it('should handle revoked token error', async () => {
      mockAuth.verifyIdToken.mockRejectedValue({
        errorInfo: { code: 'auth/id-token-revoked' },
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'revoked-token'),
      ).rejects.toThrow(
        new UnauthorizedException('Firebase ID token has been revoked'),
      );
    });

    it('should handle invalid token format error', async () => {
      mockAuth.verifyIdToken.mockRejectedValue({
        errorInfo: { code: 'auth/argument-error' },
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'malformed-token'),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid Firebase ID token format'),
      );
    });

    it('should handle invalid token error', async () => {
      mockAuth.verifyIdToken.mockRejectedValue({
        errorInfo: { code: 'auth/invalid-id-token' },
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'invalid-token'),
      ).rejects.toThrow(new UnauthorizedException('Invalid Firebase ID token'));
    });

    it('should handle unknown Firebase error codes', async () => {
      mockAuth.verifyIdToken.mockRejectedValue({
        errorInfo: { code: 'auth/unknown-error' },
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'token'),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Firebase authentication failed: auth/unknown-error',
        ),
      );
    });

    it('should handle generic errors', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Generic error'));

      await expect(
        service.validateFirebaseToken('test-uid', 'token'),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid Firebase authentication'),
      );
    });

    it('should include context in error messages', async () => {
      mockAuth.verifyIdToken.mockRejectedValue({
        errorInfo: { code: 'auth/id-token-expired' },
      });

      await expect(
        service.validateFirebaseToken('test-uid', 'token', 'addPhone'),
      ).rejects.toThrow(
        new UnauthorizedException('Firebase ID token has expired [addPhone]'),
      );
    });

    it('should rethrow UnauthorizedException as-is', async () => {
      const customError = new UnauthorizedException('Custom error');
      mockAuth.verifyIdToken.mockRejectedValue(customError);

      await expect(
        service.validateFirebaseToken('test-uid', 'token'),
      ).rejects.toThrow(customError);
    });
  });
});
