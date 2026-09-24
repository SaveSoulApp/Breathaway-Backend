jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthCredentialType, IdentityType, User } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { FirebaseService } from '@modules/firebase/firebase.service';
import { IDENTITY_ADDED_EVENT } from '@modules/identities/events';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditActionType } from '@modules/audit/dto';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import {
  AccountAlreadyExistsException,
  AccountNotFoundException,
  AuthTypeMismatchException,
  CredentialAlreadyLinkedException,
  DeletedAccountReverificationException,
  SocialAccountAlreadyLinkedException,
  UnsupportedAuthMethodException,
  UnverifiedAccountException,
  UserNotFoundException,
} from '../application/exceptions';
import { AuthService } from '../auth.service';
import { USER_WELCOME_EVENT } from '../events';
import {
  AddSecondaryAuthRequestDto,
  AuthSigninRequestDto,
  AuthSignupRequestDto,
  DevLoginRequestDto,
  SocialAuthRequestDto,
  SocialAuthType,
} from '../dto';
import { AuthCredentialService } from '../services/auth-credential.service';
import { AuthTokenService } from '../services/auth-token.service';
import {
  AuthMethod,
  getAuthMethodFromDecodedToken,
  isEmailAuthMethod,
  isPhoneAuthMethod,
} from '../utils/auth-method.utils';

describe('AuthService - Secondary Email Linking & Utils', () => {
  describe('auth-method.utils', () => {
    describe('isEmailAuthMethod & isPhoneAuthMethod', () => {
      it('should identify email auth methods correctly', () => {
        expect(isEmailAuthMethod(AuthMethod.EMAIL)).toBe(true);
        expect(isEmailAuthMethod(AuthMethod.EMAIL_LINK)).toBe(true);
        expect(isEmailAuthMethod(AuthMethod.GOOGLE)).toBe(true);
        expect(isEmailAuthMethod(AuthMethod.APPLE)).toBe(true);
        expect(isEmailAuthMethod(AuthMethod.PHONE)).toBe(false);
      });

      it('should identify phone auth methods correctly', () => {
        expect(isPhoneAuthMethod(AuthMethod.PHONE)).toBe(true);
        expect(isPhoneAuthMethod(AuthMethod.EMAIL)).toBe(false);
        expect(isPhoneAuthMethod(AuthMethod.GOOGLE)).toBe(false);
        expect(isPhoneAuthMethod(AuthMethod.EMAIL_LINK)).toBe(false);
      });
    });

    describe('getAuthMethodFromDecodedToken', () => {
      it('should parse phone authentication correctly', () => {
        const result = getAuthMethodFromDecodedToken({
          firebase: { sign_in_provider: 'phone' },
          phone_number: '+1234567890',
        });
        expect(result).toEqual({
          method: AuthMethod.PHONE,
          identifier: '+1234567890',
          isVerified: true,
        });
      });

      it('should parse email/password authentication correctly', () => {
        const result = getAuthMethodFromDecodedToken({
          firebase: { sign_in_provider: 'password' },
          email: 'test@example.com',
          email_verified: true,
        });
        expect(result).toEqual({
          method: AuthMethod.EMAIL,
          identifier: 'test@example.com',
          isVerified: true,
        });
      });

      it('should parse emailLink (magic link) authentication correctly', () => {
        const result = getAuthMethodFromDecodedToken({
          firebase: { sign_in_provider: 'emailLink' },
          email: 'magic@yahoo.com',
          email_verified: true,
        });
        expect(result).toEqual({
          method: AuthMethod.EMAIL_LINK,
          identifier: 'magic@yahoo.com',
          isVerified: true,
        });
      });

      it('should parse Google OAuth authentication correctly', () => {
        const result = getAuthMethodFromDecodedToken({
          firebase: { sign_in_provider: 'google.com' },
          email: 'googleuser@gmail.com',
          email_verified: true,
        });
        expect(result).toEqual({
          method: AuthMethod.GOOGLE,
          identifier: 'googleuser@gmail.com',
          isVerified: true,
        });
      });

      it('should parse Apple OAuth authentication correctly', () => {
        const result = getAuthMethodFromDecodedToken({
          firebase: { sign_in_provider: 'apple.com' },
          email: 'appleuser@icloud.com',
          email_verified: true,
        });
        expect(result).toEqual({
          method: AuthMethod.APPLE,
          identifier: 'appleuser@icloud.com',
          isVerified: true,
        });
      });

      it('should trim and lowercase email address across providers', () => {
        const result = getAuthMethodFromDecodedToken({
          firebase: { sign_in_provider: 'google.com' },
          email: '  UnTrimmed.CAPS@GoogleMail.COM  ',
          email_verified: true,
        });
        expect(result).toEqual({
          method: AuthMethod.GOOGLE,
          identifier: 'untrimmed.caps@googlemail.com',
          isVerified: true,
        });
      });

      it('should throw error for unsupported provider', () => {
        expect(() =>
          getAuthMethodFromDecodedToken({
            firebase: { sign_in_provider: 'unsupported-provider' },
          }),
        ).toThrow('Unsupported authentication provider: unsupported-provider');
      });

      it('should throw error if email is missing for emailLink', () => {
        expect(() =>
          getAuthMethodFromDecodedToken({
            firebase: { sign_in_provider: 'emailLink' },
          }),
        ).toThrow('Email missing from token for emailLink authentication');
      });
    });
  });

  describe('addSecondaryAuth (Email Linking)', () => {
    let service: AuthService;
    let prisma: MockPrismaService;
    let firebaseService: jest.Mocked<FirebaseService>;
    let encryptionService: jest.Mocked<IdentityCryptoService>;
    let pubSubPublisher: jest.Mocked<PubSubPublisherService>;
    let authTokenService: jest.Mocked<AuthTokenService>;
    let eventEmitter: { emit: jest.Mock };

    const mockUser: User = {
      id: 'user-uuid-1',
      createdAt: new Date(),
      deletedAt: null,
      countryCode: null,
    };

    const mockPublicValueData = {
      publicValueHash: 'canonical-email-hash-64chars',
      publicValueMasked: 't***@gmail.com',
      publicValueCiphertext: 'cipher',
      publicValueIv: 'iv',
      publicValueTag: 'tag',
      publicValueWrappedKey: 'wrappedKey',
      publicValueKeyId: 'keyId',
    };

    beforeEach(async () => {
      prisma = createPrismaMock();

      firebaseService = {
        validateFirebaseToken: jest.fn(),
      } as unknown as jest.Mocked<FirebaseService>;

      encryptionService = {
        processPublicValue: jest.fn().mockResolvedValue(mockPublicValueData),
      } as unknown as jest.Mocked<IdentityCryptoService>;

      pubSubPublisher = {
        publish: jest.fn().mockResolvedValue('msg-id-123'),
      } as unknown as jest.Mocked<PubSubPublisherService>;

      authTokenService = {
        generateAuthResponse: jest.fn().mockReturnValue({
          access_token: 'signed-access-token',
          user_id: mockUser.id,
        }),
      } as unknown as jest.Mocked<AuthTokenService>;

      const loggerMock = {
        forContext: jest.fn().mockReturnValue({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          info: jest.fn(),
          event: jest.fn(),
        }),
      };

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return cb;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          AuthCredentialService,
          { provide: PrismaService, useValue: prisma },
          { provide: FirebaseService, useValue: firebaseService },
          { provide: IdentityCryptoService, useValue: encryptionService },
          { provide: PubSubPublisherService, useValue: pubSubPublisher },
          { provide: AuthTokenService, useValue: authTokenService },
          { provide: LoggerService, useValue: loggerMock },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: ClsService, useValue: { get: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
      eventEmitter = module.get(EventEmitter2);
    });

    it('should link email successfully via Google Sign-In with isVerified = true', async () => {
      const dto: AddSecondaryAuthRequestDto = {
        uid: 'firebase-uid-google',
        uidToken: 'google-id-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: { email: 'test@gmail.com', email_verified: true } as any,
        authMethod: {
          method: AuthMethod.GOOGLE,
          identifier: 'test@gmail.com',
          isVerified: true,
        },
      });

      // Current user has no existing email credential
      prisma.authCredential.findFirst.mockResolvedValueOnce(null); // existingUserCred
      prisma.authCredential.findFirst.mockResolvedValueOnce(null); // global uniqueness
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.identity.findUnique.mockResolvedValue(null);
      prisma.identity.create.mockResolvedValue({
        id: 'new-identity-id',
        isVerified: true,
      } as any);
      prisma.authCredential.count.mockResolvedValue(1); // user already has a primary phone cred
      prisma.authCredential.create.mockResolvedValue({} as any);

      const result = await service.addSecondaryAuth(
        mockUser.id,
        dto,
        AuthMethod.EMAIL,
      );

      expect(firebaseService.validateFirebaseToken).toHaveBeenCalledWith(
        dto.uid,
        dto.uidToken,
      );
      expect(prisma.identity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: IdentityType.EMAIL,
            userId: mockUser.id,
            isVerified: true,
          }),
        }),
      );
      expect(prisma.authCredential.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            type: AuthCredentialType.EMAIL,
            isPrimary: false,
          }),
        }),
      );
      expect(result).toEqual({
        access_token: 'signed-access-token',
        user_id: mockUser.id,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        IDENTITY_ADDED_EVENT,
        expect.objectContaining({
          userId: mockUser.id,
          identityType: 'Email',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        USER_WELCOME_EVENT,
        expect.objectContaining({
          userId: mockUser.id,
        }),
      );
    });

    it('should link email successfully via Firebase Email Link (magic link)', async () => {
      const dto: AddSecondaryAuthRequestDto = {
        uid: 'firebase-uid-magic',
        uidToken: 'magic-link-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: { email: 'user@yahoo.com', email_verified: true } as any,
        authMethod: {
          method: AuthMethod.EMAIL_LINK,
          identifier: 'user@yahoo.com',
          isVerified: true,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValueOnce(null);
      prisma.authCredential.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.identity.findUnique.mockResolvedValue(null);
      prisma.identity.create.mockResolvedValue({
        id: 'new-identity-id',
        isVerified: true,
      } as any);
      prisma.authCredential.count.mockResolvedValue(1);
      prisma.authCredential.create.mockResolvedValue({} as any);

      const result = await service.addSecondaryAuth(
        mockUser.id,
        dto,
        AuthMethod.EMAIL,
      );

      expect(result).toBeDefined();
      expect(prisma.identity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isVerified: true,
          }),
        }),
      );
    });

    it('should reject unverified email tokens with UnverifiedAccountException', async () => {
      const dto: AddSecondaryAuthRequestDto = {
        uid: 'firebase-uid-unverified',
        uidToken: 'unverified-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'unverified@hotmail.com',
          email_verified: false,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'unverified@hotmail.com',
          isVerified: false,
        },
      });

      await expect(
        service.addSecondaryAuth(mockUser.id, dto, AuthMethod.EMAIL),
      ).rejects.toThrow(UnverifiedAccountException);
    });

    it('should reject with AuthTypeMismatchException when phone token is sent to addEmail', async () => {
      const dto: AddSecondaryAuthRequestDto = {
        uid: 'firebase-uid-phone',
        uidToken: 'phone-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: { phone_number: '+1234567890' } as any,
        authMethod: {
          method: AuthMethod.PHONE,
          identifier: '+1234567890',
          isVerified: true,
        },
      });

      await expect(
        service.addSecondaryAuth(mockUser.id, dto, AuthMethod.EMAIL),
      ).rejects.toThrow(AuthTypeMismatchException);
    });

    it('should reject with CredentialAlreadyLinkedException if user already has an active email credential', async () => {
      const dto: AddSecondaryAuthRequestDto = {
        uid: 'firebase-uid-google',
        uidToken: 'google-id-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'second@gmail.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.GOOGLE,
          identifier: 'second@gmail.com',
          isVerified: true,
        },
      });

      // User already has an active EMAIL credential
      prisma.authCredential.findFirst.mockResolvedValueOnce({
        id: 'existing-cred-id',
        userId: mockUser.id,
        type: AuthCredentialType.EMAIL,
        valueHash: 'old-email-hash',
        deletedAt: null,
      } as any);

      await expect(
        service.addSecondaryAuth(mockUser.id, dto, AuthMethod.EMAIL),
      ).rejects.toThrow(CredentialAlreadyLinkedException);
    });

    it('should reject with AccountAlreadyExistsException if email is already in use by another account', async () => {
      const dto: AddSecondaryAuthRequestDto = {
        uid: 'firebase-uid-google',
        uidToken: 'google-id-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: { email: 'taken@gmail.com', email_verified: true } as any,
        authMethod: {
          method: AuthMethod.GOOGLE,
          identifier: 'taken@gmail.com',
          isVerified: true,
        },
      });

      // User does not have an active email
      prisma.authCredential.findFirst.mockResolvedValueOnce(null);
      // But another user has this email
      prisma.authCredential.findFirst.mockResolvedValueOnce({
        id: 'other-cred-id',
        userId: 'other-user-uuid',
        valueHash: mockPublicValueData.publicValueHash,
      } as any);

      await expect(
        service.addSecondaryAuth(mockUser.id, dto, AuthMethod.EMAIL),
      ).rejects.toThrow(AccountAlreadyExistsException);
    });

    it('should claim ghost identity and dispatch IDENTITY_CLAIMED Pub/Sub event', async () => {
      const dto: AddSecondaryAuthRequestDto = {
        uid: 'firebase-uid-google',
        uidToken: 'google-id-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: { email: 'ghost@gmail.com', email_verified: true } as any,
        authMethod: {
          method: AuthMethod.GOOGLE,
          identifier: 'ghost@gmail.com',
          isVerified: true,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValueOnce(null);
      prisma.authCredential.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Ghost identity exists (userId: null)
      const ghostIdentity = {
        id: 'ghost-identity-id',
        userId: null,
        type: IdentityType.EMAIL,
      };
      prisma.identity.findUnique.mockResolvedValue(ghostIdentity as any);
      prisma.identity.update.mockResolvedValue({
        ...ghostIdentity,
        userId: mockUser.id,
        isVerified: true,
      } as any);
      prisma.authCredential.count.mockResolvedValue(1);
      prisma.authCredential.create.mockResolvedValue({} as any);

      await service.addSecondaryAuth(mockUser.id, dto, AuthMethod.EMAIL);

      expect(prisma.identity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ghostIdentity.id },
          data: expect.objectContaining({
            userId: mockUser.id,
            isVerified: true,
          }),
        }),
      );
      expect(pubSubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.IDENTITY_WORKFLOWS,
        PubSubEvent.IDENTITY_CLAIMED,
        { userId: mockUser.id },
      );
    });

    const defaultDto: AddSecondaryAuthRequestDto = {
      uid: 'uid-test',
      uidToken: 'token-test',
    };

    it('should throw UserNotFoundException when target user is not found', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'secondary@example.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'secondary@example.com',
          isVerified: true,
        },
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.addSecondaryAuth(
          'non-existent-user',
          defaultDto,
          AuthMethod.EMAIL,
        ),
      ).rejects.toThrow(UserNotFoundException);
    });

    it('should throw SocialAccountAlreadyLinkedException when identity is already linked to another user', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'secondary@example.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'secondary@example.com',
          isVerified: true,
        },
      });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.identity.findUnique.mockResolvedValue({
        id: 'existing-ident',
        userId: 'other-user-uuid',
      } as any);

      await expect(
        service.addSecondaryAuth(mockUser.id, defaultDto, AuthMethod.EMAIL),
      ).rejects.toThrow(SocialAccountAlreadyLinkedException);
    });

    it('should log error and rethrow when transaction encounters unexpected error', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'secondary@example.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'secondary@example.com',
          isVerified: true,
        },
      });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.identity.findUnique.mockRejectedValue(new Error('DB failure'));

      await expect(
        service.addSecondaryAuth(mockUser.id, defaultDto, AuthMethod.EMAIL),
      ).rejects.toThrow('DB failure');
    });

    it('should swallow and log error when pubsub publish fails for claimed ghost identity', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'secondary@example.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'secondary@example.com',
          isVerified: true,
        },
      });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const ghostIdentity = {
        id: 'ghost-ident-uuid',
        userId: null,
      };
      prisma.identity.findUnique.mockResolvedValue(ghostIdentity as any);
      prisma.identity.update.mockResolvedValue({
        ...ghostIdentity,
        userId: mockUser.id,
        isVerified: true,
      } as any);
      prisma.authCredential.count.mockResolvedValue(1);
      prisma.authCredential.create.mockResolvedValue({} as any);
      pubSubPublisher.publish.mockRejectedValue(
        new Error('PubSub network down'),
      );

      const result = await service.addSecondaryAuth(
        mockUser.id,
        defaultDto,
        AuthMethod.EMAIL,
      );
      expect(result).toBeDefined();
    });

    it('should throw UnsupportedAuthMethodException when auth method is unsupported', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {} as any,
        authMethod: {
          method: 'UNKNOWN_METHOD' as any,
          identifier: 'test',
          isVerified: true,
        },
      });

      await expect(
        service.addSecondaryAuth(mockUser.id, defaultDto, AuthMethod.EMAIL),
      ).rejects.toThrow(UnsupportedAuthMethodException);
    });
  });

  describe('signup', () => {
    let service: AuthService;
    let prisma: MockPrismaService;
    let firebaseService: jest.Mocked<FirebaseService>;
    let encryptionService: jest.Mocked<IdentityCryptoService>;
    let pubSubPublisher: jest.Mocked<PubSubPublisherService>;
    let authTokenService: jest.Mocked<AuthTokenService>;

    const mockUser: User = {
      id: 'user-uuid-1',
      createdAt: new Date(),
      deletedAt: null,
      countryCode: null,
    };

    const mockPublicValueData = {
      publicValueHash: 'canonical-email-hash-64chars',
      publicValueMasked: 'g***@gmail.com',
      publicValueCiphertext: 'cipher',
      publicValueIv: 'iv',
      publicValueTag: 'tag',
      publicValueWrappedKey: 'wrappedKey',
      publicValueKeyId: 'keyId',
    };

    beforeEach(async () => {
      prisma = createPrismaMock();

      firebaseService = {
        validateFirebaseToken: jest.fn(),
      } as unknown as jest.Mocked<FirebaseService>;

      encryptionService = {
        processPublicValue: jest.fn().mockResolvedValue(mockPublicValueData),
      } as unknown as jest.Mocked<IdentityCryptoService>;

      pubSubPublisher = {
        publish: jest.fn().mockResolvedValue('msg-id-123'),
      } as unknown as jest.Mocked<PubSubPublisherService>;

      authTokenService = {
        generateAuthResponse: jest.fn().mockReturnValue({
          access_token: 'signed-access-token',
          user_id: mockUser.id,
        }),
      } as unknown as jest.Mocked<AuthTokenService>;

      const loggerMock = {
        forContext: jest.fn().mockReturnValue({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          info: jest.fn(),
          event: jest.fn(),
        }),
      };

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return cb;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          AuthCredentialService,
          { provide: PrismaService, useValue: prisma },
          { provide: FirebaseService, useValue: firebaseService },
          { provide: IdentityCryptoService, useValue: encryptionService },
          { provide: PubSubPublisherService, useValue: pubSubPublisher },
          { provide: AuthTokenService, useValue: authTokenService },
          { provide: LoggerService, useValue: loggerMock },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: ClsService, useValue: { get: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should set isVerified to true when signing up with a verified provider (e.g. Google)', async () => {
      const dto: AuthSignupRequestDto = {
        uid: 'firebase-uid-google',
        uidToken: 'google-id-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'google@gmail.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.GOOGLE,
          identifier: 'google@gmail.com',
          isVerified: true,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.identity.findUnique.mockResolvedValue(null);
      prisma.identity.create.mockResolvedValue({
        id: 'new-identity-id',
        isVerified: true,
      } as any);
      prisma.authCredential.create.mockResolvedValue({} as any);

      const result = await service.signup(dto);

      expect(result).toEqual({
        userId: mockUser.id,
        status: 'verified',
      });
      expect(prisma.identity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isVerified: true,
          }),
        }),
      );
    });

    it('should set isVerified to false when signing up with an unverified provider', async () => {
      const dto: AuthSignupRequestDto = {
        uid: 'firebase-uid-email',
        uidToken: 'email-id-token',
      };

      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'unverified@example.com',
          email_verified: false,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'unverified@example.com',
          isVerified: false,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.identity.findUnique.mockResolvedValue(null);
      prisma.identity.create.mockResolvedValue({
        id: 'new-identity-id',
        isVerified: false,
      } as any);
      prisma.authCredential.create.mockResolvedValue({} as any);

      const result = await service.signup(dto);

      expect(result).toEqual({
        userId: mockUser.id,
        status: 'pending_verification',
      });
      expect(prisma.identity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isVerified: false,
            verifiedAt: null,
          }),
        }),
      );
    });
  });

  describe('signin', () => {
    let service: AuthService;
    let prisma: MockPrismaService;
    let firebaseService: jest.Mocked<FirebaseService>;
    let encryptionService: jest.Mocked<IdentityCryptoService>;
    let pubSubPublisher: jest.Mocked<PubSubPublisherService>;
    let authTokenService: jest.Mocked<AuthTokenService>;

    const mockUser: User = {
      id: 'user-uuid-1',
      createdAt: new Date(),
      deletedAt: null,
      countryCode: null,
    };

    const mockPublicValueData = {
      publicValueHash: 'canonical-email-hash-64chars',
      publicValueMasked: 'u***@example.com',
      publicValueCiphertext: 'cipher',
      publicValueIv: 'iv',
      publicValueTag: 'tag',
      publicValueWrappedKey: 'wrappedKey',
      publicValueKeyId: 'keyId',
    };

    const dto: AuthSigninRequestDto = {
      uid: 'firebase-uid',
      uidToken: 'valid-id-token',
    };

    beforeEach(async () => {
      prisma = createPrismaMock();

      firebaseService = {
        validateFirebaseToken: jest.fn(),
      } as unknown as jest.Mocked<FirebaseService>;

      encryptionService = {
        processPublicValue: jest.fn().mockResolvedValue(mockPublicValueData),
      } as unknown as jest.Mocked<IdentityCryptoService>;

      pubSubPublisher = {
        publish: jest.fn().mockResolvedValue('msg-id-123'),
      } as unknown as jest.Mocked<PubSubPublisherService>;

      authTokenService = {
        generateAuthResponse: jest.fn().mockReturnValue({
          access_token: 'signed-access-token',
          user_id: mockUser.id,
        }),
      } as unknown as jest.Mocked<AuthTokenService>;

      const loggerMock = {
        forContext: jest.fn().mockReturnValue({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          info: jest.fn(),
          event: jest.fn(),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          AuthCredentialService,
          { provide: PrismaService, useValue: prisma },
          { provide: FirebaseService, useValue: firebaseService },
          { provide: IdentityCryptoService, useValue: encryptionService },
          { provide: PubSubPublisherService, useValue: pubSubPublisher },
          { provide: AuthTokenService, useValue: authTokenService },
          { provide: LoggerService, useValue: loggerMock },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: ClsService, useValue: { get: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should sign in successfully when existing account is verified', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'user@example.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'user@example.com',
          isVerified: true,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValue({
        userId: mockUser.id,
        identityId: 'identity-123',
      } as any);
      prisma.identity.findUnique.mockResolvedValue({
        isVerified: true,
      } as any);
      prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      const result = await service.signin(dto);

      expect(result).toEqual({
        access_token: 'signed-access-token',
        user_id: mockUser.id,
      });
      expect(prisma.identity.update).not.toHaveBeenCalled();
    });

    it('should auto-verify account and publish IDENTITY_CLAIMED when existing account in DB is unverified but token is verified', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'user@example.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.GOOGLE,
          identifier: 'user@example.com',
          isVerified: true,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValue({
        userId: mockUser.id,
        identityId: 'identity-123',
      } as any);
      prisma.identity.findUnique.mockResolvedValue({
        isVerified: false,
      } as any);
      prisma.identity.update.mockResolvedValue({
        id: 'identity-123',
        isVerified: true,
      } as any);
      prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      const result = await service.signin(dto);

      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: 'identity-123' },
        data: {
          isVerified: true,
          verifiedAt: expect.any(Date),
        },
      });
      expect(pubSubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.IDENTITY_WORKFLOWS,
        PubSubEvent.IDENTITY_CLAIMED,
        { userId: mockUser.id },
      );
      expect(result).toEqual({
        access_token: 'signed-access-token',
        user_id: mockUser.id,
      });
    });

    it('should throw UnverifiedAccountException when existing account is unverified and token is not verified', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'user@example.com',
          email_verified: false,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'user@example.com',
          isVerified: false,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValue({
        userId: mockUser.id,
        identityId: 'identity-123',
      } as any);
      prisma.identity.findUnique.mockResolvedValue({
        isVerified: false,
      } as any);

      await expect(service.signin(dto)).rejects.toThrow(
        UnverifiedAccountException,
      );
      expect(prisma.identity.update).not.toHaveBeenCalled();
    });
  });

  describe('signInOrSignUp', () => {
    let service: AuthService;
    let prisma: MockPrismaService;
    let firebaseService: jest.Mocked<FirebaseService>;
    let encryptionService: jest.Mocked<IdentityCryptoService>;
    let pubSubPublisher: jest.Mocked<PubSubPublisherService>;
    let authTokenService: jest.Mocked<AuthTokenService>;

    const mockUser: User = {
      id: 'user-uuid-1',
      createdAt: new Date(),
      deletedAt: null,
      countryCode: null,
    };

    const mockPublicValueData = {
      publicValueHash: 'canonical-email-hash-64chars',
      publicValueMasked: 'u***@example.com',
      publicValueCiphertext: 'cipher',
      publicValueIv: 'iv',
      publicValueTag: 'tag',
      publicValueWrappedKey: 'wrappedKey',
      publicValueKeyId: 'keyId',
    };

    const dto: AuthSigninRequestDto = {
      uid: 'firebase-uid',
      uidToken: 'valid-id-token',
    };

    beforeEach(async () => {
      prisma = createPrismaMock();

      firebaseService = {
        validateFirebaseToken: jest.fn(),
      } as unknown as jest.Mocked<FirebaseService>;

      encryptionService = {
        processPublicValue: jest.fn().mockResolvedValue(mockPublicValueData),
      } as unknown as jest.Mocked<IdentityCryptoService>;

      pubSubPublisher = {
        publish: jest.fn().mockResolvedValue('msg-id-123'),
      } as unknown as jest.Mocked<PubSubPublisherService>;

      authTokenService = {
        generateAuthResponse: jest.fn().mockReturnValue({
          access_token: 'signed-access-token',
          user_id: mockUser.id,
        }),
      } as unknown as jest.Mocked<AuthTokenService>;

      const loggerMock = {
        forContext: jest.fn().mockReturnValue({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          info: jest.fn(),
          event: jest.fn(),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          AuthCredentialService,
          { provide: PrismaService, useValue: prisma },
          { provide: FirebaseService, useValue: firebaseService },
          { provide: IdentityCryptoService, useValue: encryptionService },
          { provide: PubSubPublisherService, useValue: pubSubPublisher },
          { provide: AuthTokenService, useValue: authTokenService },
          { provide: LoggerService, useValue: loggerMock },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: ClsService, useValue: { get: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should auto-verify existing unverified account and publish IDENTITY_CLAIMED when token is verified', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'user@example.com',
          email_verified: true,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL_LINK,
          identifier: 'user@example.com',
          isVerified: true,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValue({
        userId: mockUser.id,
        identityId: 'identity-123',
      } as any);
      prisma.identity.findUnique.mockResolvedValue({
        isVerified: false,
      } as any);
      prisma.identity.update.mockResolvedValue({
        id: 'identity-123',
        isVerified: true,
      } as any);
      prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      await service.signInOrSignUp(dto);

      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: 'identity-123' },
        data: {
          isVerified: true,
          verifiedAt: expect.any(Date),
        },
      });
      expect(pubSubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.IDENTITY_WORKFLOWS,
        PubSubEvent.IDENTITY_CLAIMED,
        { userId: mockUser.id },
      );
    });

    it('should throw UnverifiedAccountException when existing account is unverified and token is unverified', async () => {
      firebaseService.validateFirebaseToken.mockResolvedValue({
        decodedToken: {
          email: 'user@example.com',
          email_verified: false,
        } as any,
        authMethod: {
          method: AuthMethod.EMAIL,
          identifier: 'user@example.com',
          isVerified: false,
        },
      });

      prisma.authCredential.findFirst.mockResolvedValue({
        userId: mockUser.id,
        identityId: 'identity-123',
      } as any);
      prisma.identity.findUnique.mockResolvedValue({
        isVerified: false,
      } as any);

      await expect(service.signInOrSignUp(dto)).rejects.toThrow(
        UnverifiedAccountException,
      );
      expect(prisma.identity.update).not.toHaveBeenCalled();
    });
  });

  describe('socialAuth', () => {
    let service: AuthService;
    let prisma: MockPrismaService;
    let encryptionService: jest.Mocked<IdentityCryptoService>;
    let authTokenService: jest.Mocked<AuthTokenService>;

    const mockUser: User = {
      id: 'user-social-1',
      createdAt: new Date(),
      deletedAt: null,
      countryCode: null,
    };

    let pubSubPublisher: jest.Mocked<PubSubPublisherService>;

    beforeEach(async () => {
      prisma = createPrismaMock();
      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return cb;
      });
      encryptionService = {
        processPlatformId: jest.fn().mockResolvedValue({
          platformIdHash: 'hashed-platform-id',
        }),
        processPublicValue: jest.fn().mockResolvedValue({
          publicValueHash: 'hashed-public-value',
          publicValueMasked: 'instahandle',
          publicValueCiphertext: 'cipher',
          publicValueIv: 'iv',
          publicValueTag: 'tag',
          publicValueWrappedKey: 'wrappedKey',
          publicValueKeyId: 'keyId',
        }),
      } as unknown as jest.Mocked<IdentityCryptoService>;
      pubSubPublisher = {
        publish: jest.fn().mockResolvedValue('msg-id-123'),
      } as unknown as jest.Mocked<PubSubPublisherService>;
      authTokenService = {
        generateAuthResponse: jest.fn().mockReturnValue({
          access_token: 'social-jwt-token',
          user_id: mockUser.id,
        }),
      } as unknown as jest.Mocked<AuthTokenService>;

      const loggerMock = {
        forContext: jest.fn().mockReturnValue({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          info: jest.fn(),
          event: jest.fn(),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prisma },
          { provide: IdentityCryptoService, useValue: encryptionService },
          { provide: AuthTokenService, useValue: authTokenService },
          { provide: FirebaseService, useValue: {} },
          { provide: PubSubPublisherService, useValue: pubSubPublisher },
          { provide: AuthCredentialService, useValue: {} },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: LoggerService, useValue: loggerMock },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should log in an existing verified social user', async () => {
      const dto: SocialAuthRequestDto = {
        type: SocialAuthType.INSTAGRAM,
        platformUserId: 'insta-123',
        handle: 'instahandle',
      };

      prisma.identity.findFirst.mockResolvedValue({
        id: 'ident-social-1',
        userId: mockUser.id,
        isVerified: true,
      } as any);
      prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      const result = await service.socialAuth(dto);

      expect(encryptionService.processPlatformId).toHaveBeenCalledWith(
        'insta-123',
      );
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type: IdentityType.INSTAGRAM,
          platformIdHash: 'hashed-platform-id',
        },
        select: { id: true, userId: true, isVerified: true },
      });
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(authTokenService.generateAuthResponse).toHaveBeenCalledWith(
        mockUser,
        {
          authMethod: IdentityType.INSTAGRAM,
          platformIdHash: 'hashed-platform-id',
          isNewUser: false,
        },
      );
      expect(result).toEqual({
        access_token: 'social-jwt-token',
        user_id: mockUser.id,
      });
    });

    it('should throw DeletedAccountReverificationException when identity belongs to deleted account', async () => {
      const dto: SocialAuthRequestDto = {
        type: SocialAuthType.INSTAGRAM,
        platformUserId: 'insta-deleted',
        handle: 'deletedhandle',
      };

      prisma.identity.findFirst.mockResolvedValue({
        id: 'ident-deleted-1',
        userId: null,
        isVerified: true,
      } as any);

      await expect(service.socialAuth(dto)).rejects.toThrow(
        DeletedAccountReverificationException,
      );
    });

    it('should register a new social user when identity does not exist', async () => {
      const dto: SocialAuthRequestDto = {
        type: SocialAuthType.INSTAGRAM,
        platformUserId: 'insta-new',
        handle: 'newhandle',
      };

      prisma.identity.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.identity.findUnique.mockResolvedValue(null);
      prisma.identity.create.mockResolvedValue({ id: 'new-ident' } as any);

      const result = await service.socialAuth(dto);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(authTokenService.generateAuthResponse).toHaveBeenCalledWith(
        mockUser,
        {
          authMethod: IdentityType.INSTAGRAM,
          platformIdHash: 'hashed-platform-id',
          isNewUser: true,
        },
      );
      expect(result).toEqual({
        access_token: 'social-jwt-token',
        user_id: mockUser.id,
      });
    });

    it('should claim ghost identity when registering new social user and handle matches ghost', async () => {
      const dto: SocialAuthRequestDto = {
        type: SocialAuthType.INSTAGRAM,
        platformUserId: 'insta-claim',
        handle: 'ghosthandle',
      };

      prisma.identity.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      const ghost = { id: 'ghost-1', userId: null };
      prisma.identity.findUnique.mockResolvedValue(ghost as any);
      prisma.identity.update.mockResolvedValue({
        ...ghost,
        userId: mockUser.id,
      } as any);

      const result = await service.socialAuth(dto);

      expect(prisma.identity.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw SocialAccountAlreadyLinkedException if ghost identity is already owned by active user', async () => {
      const dto: SocialAuthRequestDto = {
        type: SocialAuthType.INSTAGRAM,
        platformUserId: 'insta-claim',
        handle: 'ghosthandle',
      };

      prisma.identity.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      const ownedGhost = { id: 'ghost-1', userId: 'another-user' };
      prisma.identity.findUnique.mockResolvedValue(ownedGhost as any);

      await expect(service.socialAuth(dto)).rejects.toThrow(
        SocialAccountAlreadyLinkedException,
      );
    });

    it('should log error and rethrow when social auth transaction fails with unexpected error', async () => {
      const dto: SocialAuthRequestDto = {
        type: SocialAuthType.INSTAGRAM,
        platformUserId: 'insta-fail',
        handle: 'failhandle',
      };

      prisma.identity.findFirst.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('DB transaction error'));

      await expect(service.socialAuth(dto)).rejects.toThrow(
        'DB transaction error',
      );
    });
  });

  describe('devLogin', () => {
    let service: AuthService;
    let prisma: MockPrismaService;
    let encryptionService: jest.Mocked<IdentityCryptoService>;
    let authTokenService: jest.Mocked<AuthTokenService>;

    const mockUser: User = {
      id: 'user-dev-1',
      createdAt: new Date(),
      deletedAt: null,
      countryCode: 'US',
    };

    beforeEach(async () => {
      prisma = createPrismaMock();
      encryptionService = {
        processPublicValue: jest.fn().mockImplementation((val, type) =>
          Promise.resolve({
            publicValueHash: `hash-${val}-${type}`,
          }),
        ),
      } as unknown as jest.Mocked<IdentityCryptoService>;
      authTokenService = {
        generateAuthResponse: jest.fn().mockReturnValue({
          access_token: 'dev-jwt-token',
          user_id: mockUser.id,
        }),
      } as unknown as jest.Mocked<AuthTokenService>;

      const loggerMock = {
        forContext: jest.fn().mockReturnValue({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          info: jest.fn(),
          event: jest.fn(),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prisma },
          { provide: IdentityCryptoService, useValue: encryptionService },
          { provide: AuthTokenService, useValue: authTokenService },
          { provide: FirebaseService, useValue: {} },
          { provide: PubSubPublisherService, useValue: {} },
          { provide: AuthCredentialService, useValue: {} },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: LoggerService, useValue: loggerMock },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should log in dev user with email identifier', async () => {
      const dto: DevLoginRequestDto = { identifier: 'dev@breathaway.test' };

      prisma.authCredential.findFirst.mockResolvedValue({
        id: 'cred-1',
        valueHash: 'hash-dev@breathaway.test-EMAIL',
        user: mockUser,
      } as any);

      const result = await service.devLogin(dto);

      expect(encryptionService.processPublicValue).toHaveBeenCalledWith(
        'dev@breathaway.test',
        IdentityType.EMAIL,
      );
      expect(authTokenService.generateAuthResponse).toHaveBeenCalledWith(
        mockUser,
        {
          authMethod: 'DEV_LOGIN',
          publicValueHash: 'hash-dev@breathaway.test-EMAIL',
        },
      );
      expect(result).toEqual({
        access_token: 'dev-jwt-token',
        user_id: mockUser.id,
      });
    });

    it('should log in dev user with phone identifier', async () => {
      const dto: DevLoginRequestDto = { identifier: '+1234567890' };

      prisma.authCredential.findFirst.mockResolvedValue({
        id: 'cred-2',
        valueHash: 'hash-+1234567890-PHONE',
        user: mockUser,
      } as any);

      const result = await service.devLogin(dto);

      expect(encryptionService.processPublicValue).toHaveBeenCalledWith(
        '+1234567890',
        IdentityType.PHONE,
      );
      expect(authTokenService.generateAuthResponse).toHaveBeenCalledWith(
        mockUser,
        {
          authMethod: 'DEV_LOGIN',
          publicValueHash: 'hash-+1234567890-PHONE',
        },
      );
      expect(result).toEqual({
        access_token: 'dev-jwt-token',
        user_id: mockUser.id,
      });
    });

    it('should throw UserNotFoundException if credential is not found', async () => {
      const dto: DevLoginRequestDto = { identifier: 'unknown@example.com' };
      prisma.authCredential.findFirst.mockResolvedValue(null);

      await expect(service.devLogin(dto)).rejects.toThrow(
        UserNotFoundException,
      );
    });
  });

  describe('signout', () => {
    let service: AuthService;
    let eventEmitter: { emit: jest.Mock };

    beforeEach(async () => {
      eventEmitter = { emit: jest.fn() };
      const loggerMock = {
        forContext: jest.fn().mockReturnValue({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          info: jest.fn(),
          event: jest.fn(),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: createPrismaMock() },
          { provide: IdentityCryptoService, useValue: {} },
          { provide: AuthTokenService, useValue: {} },
          { provide: FirebaseService, useValue: {} },
          { provide: PubSubPublisherService, useValue: {} },
          { provide: AuthCredentialService, useValue: {} },
          { provide: EventEmitter2, useValue: eventEmitter },
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: LoggerService, useValue: loggerMock },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should emit audit log and return confirmation message', () => {
      const result = service.signout('user-signout-123');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.USER_LOGOUT,
          userId: 'user-signout-123',
        }),
      );
      expect(result).toEqual({ message: 'Signout successful' });
    });
  });
});
