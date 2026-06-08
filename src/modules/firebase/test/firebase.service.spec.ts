import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase.service';
import { LoggerService } from '@core/logger';
import * as admin from 'firebase-admin';

// Mock firebase-admin
const mockApps: unknown[] = [];
jest.mock('firebase-admin', () => ({
  get apps() {
    return mockApps;
  },
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  auth: jest.fn(),
  messaging: jest.fn(),
}));

describe('FirebaseService', () => {
  let service: FirebaseService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        FIREBASE_PROJECT_ID: 'test-project',
        FIREBASE_CLIENT_EMAIL: 'test@test.com',
        FIREBASE_PRIVATE_KEY: 'test-private-key\\nwith-newlines',
      };
      return config[key];
    }),
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

  const mockMessaging = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock console.error to suppress expected error logs in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset mockApps
    mockApps.length = 0;

    // Setup mocks
    (admin.auth as jest.Mock).mockReturnValue(mockAuth);
    (admin.messaging as jest.Mock).mockReturnValue(mockMessaging);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
      ],
    }).compile();

    service = module.get<FirebaseService>(FirebaseService);
  });

  afterEach(() => {
    // Restore console.error
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Firebase when no apps exist', () => {
      mockApps.length = 0;

      service.onModuleInit();

      expect(admin.initializeApp).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Firebase Admin SDK initialized successfully',
      );
    });

    it('should not reinitialize Firebase when app already exists', () => {
      mockApps.push({ name: 'test-app' });

      service.onModuleInit();

      expect(admin.initializeApp).not.toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Firebase Admin SDK initialized successfully',
      );
    });

    it('should log error when initialization fails', () => {
      mockApps.length = 0;
      const error = new Error('Initialization failed');
      (admin.initializeApp as jest.Mock).mockImplementationOnce(() => {
        throw error;
      });

      service.onModuleInit();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Failed to initialize Firebase Admin SDK:',
        error,
      );
    });
  });

  describe('initializeFirebase', () => {
    it('should initialize Firebase with correct credentials', () => {
      mockApps.length = 0;

      service['initializeFirebase']();

      expect(admin.credential.cert).toHaveBeenCalledWith({
        projectId: 'test-project',
        clientEmail: 'test@test.com',
        privateKey: 'test-private-key\nwith-newlines',
      });
      expect(admin.initializeApp).toHaveBeenCalled();
    });

    it('should replace escaped newlines in private key', () => {
      mockApps.length = 0;

      service['initializeFirebase']();

      expect(admin.credential.cert).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: expect.stringContaining('\n'),
        }),
      );
    });
  });

  describe('getMessaging', () => {
    it('should return messaging instance', () => {
      const result = service.getMessaging();

      expect(result).toBe(mockMessaging);
      expect(admin.messaging).toHaveBeenCalled();
    });
  });

  describe('verifyIdToken', () => {
    it('should verify valid token', async () => {
      const mockDecodedToken = {
        uid: 'test-uid',
        email: 'test@example.com',
      };
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
      };
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
    };

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
