import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { LoggerService } from 'src/core/logger/logger.service';
import { FirebaseService } from 'src/modules/firebase/firebase.service';
import { AuthVerificationService } from '../auth-verification.service';
import { AuthSignupDto, AuthSigninDto, AddSecondaryAuthDto } from '../dto';
import { AuthMethod } from '../utils/auth-method.utils';

// Mock nanoid to avoid ESM import issues
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-nanoid-123'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let firebaseService: FirebaseService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let authVerificationService: AuthVerificationService;

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockFirebaseService = {
    validateFirebaseToken: jest.fn(),
    getUser: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        APP_NAME: 'BreathAway',
        JWT_AUDIENCE: 'test-audience',
        JWT_ISSUER: 'test-issuer',
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

  const mockAuthVerificationService = {
    validateAuthMethodType: jest.fn(),
    validateUserHasNoExistingAuthMethod: jest.fn(),
    validateAuthIdentifierNotUsedByOthers: jest.fn(),
  };

  const mockUser = {
    user_id: 1,
    email: 'test@example.com',
    phone: null,
    email_verified: true,
    phone_verified: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockGoogleAuthMethod = {
    method: AuthMethod.GOOGLE,
    identifier: 'test@gmail.com',
    isVerified: true,
  };

  const mockPhoneAuthMethod = {
    method: AuthMethod.PHONE,
    identifier: '+1234567890',
    isVerified: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: FirebaseService,
          useValue: mockFirebaseService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: AuthVerificationService,
          useValue: mockAuthVerificationService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    firebaseService = module.get<FirebaseService>(FirebaseService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    authVerificationService = module.get<AuthVerificationService>(
      AuthVerificationService,
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signup', () => {
    const signupDto: AuthSignupDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should create user with Google auth', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
        decodedToken: {},
      });
      mockFirebaseService.getUser.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: 'test@gmail.com',
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.signup(signupDto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@gmail.com',
          email_verified: true,
          phone: null,
          phone_verified: false,
        },
      });
      expect(result).toHaveProperty('access_token');
      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('should create user with phone auth', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
        decodedToken: {},
      });
      mockFirebaseService.getUser.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: null,
        phone: '+1234567890',
        phone_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.signup(signupDto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          phone: '+1234567890',
          phone_verified: true,
          email: null,
          email_verified: false,
        },
      });
      expect(result.phone).toBe('+1234567890');
    });

    it('should throw ConflictException when user exists with same email', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
        decodedToken: {},
      });
      mockFirebaseService.getUser.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.signup(signupDto)).rejects.toThrow(
        new ConflictException('User already exists with this email'),
      );
    });

    it('should throw ConflictException when user exists with same phone', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
        decodedToken: {},
      });
      mockFirebaseService.getUser.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        phone: '+1234567890',
      });

      await expect(service.signup(signupDto)).rejects.toThrow(
        new ConflictException('User already exists with this phone number'),
      );
    });

    it('should generate JWT token with correct payload', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
        decodedToken: {},
      });
      mockFirebaseService.getUser.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      await service.signup(signupDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.user_id,
          iss: 'BreathAway',
          aud: 'test-audience',
          jti: expect.any(String),
        }),
      );
    });
  });

  describe('signin', () => {
    const signinDto: AuthSigninDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should signin existing user with Google auth', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.signin(signinDto);

      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@gmail.com' },
      });
      expect(result).toHaveProperty('access_token');
      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('should signin existing user with phone auth', async () => {
      const phoneUser = {
        ...mockUser,
        email: null,
        phone: '+1234567890',
        phone_verified: true,
      };
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(phoneUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.signin(signinDto);

      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { phone: '+1234567890' },
      });
      expect(result.phone).toBe('+1234567890');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.signin(signinDto)).rejects.toThrow(
        new NotFoundException(
          'User with email test@gmail.com not found. Please sign up first.',
        ),
      );
    });

    it('should update email verification status on signin', async () => {
      const unverifiedUser = { ...mockUser, email_verified: false };
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(unverifiedUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...unverifiedUser,
        email_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      await service.signin(signinDto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: unverifiedUser.user_id },
        data: { email_verified: true },
      });
    });

    it('should update phone verification status on signin', async () => {
      const unverifiedPhoneUser = {
        ...mockUser,
        email: null,
        phone: '+1234567890',
        phone_verified: false,
      };
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(unverifiedPhoneUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...unverifiedPhoneUser,
        phone_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      await service.signin(signinDto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: unverifiedPhoneUser.user_id },
        data: { phone_verified: true },
      });
    });

    it('should not update verification if already verified', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      await service.signin(signinDto);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('signInOrSignUp', () => {
    const signinOrSignupDto: AuthSigninDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should signin when user exists', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.signInOrSignUp(signinOrSignupDto);

      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
      expect(result.user_id).toBe(mockUser.user_id);
    });

    it('should signup when user does not exist', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        user_id: 999,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.signInOrSignUp(signinOrSignupDto);

      expect(mockPrismaService.user.create).toHaveBeenCalled();
      expect(result.user_id).toBe(999);
    });

    it('should update verification status for existing user', async () => {
      const unverifiedUser = { ...mockUser, email_verified: false };
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(unverifiedUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...unverifiedUser,
        email_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      await service.signInOrSignUp(signinOrSignupDto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: unverifiedUser.user_id },
        data: { email_verified: true },
      });
    });

    it('should create new user for non-existing user', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: null,
        phone: '+1234567890',
        phone_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.signInOrSignUp(signinOrSignupDto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          phone: '+1234567890',
          phone_verified: true,
          email: null,
          email_verified: false,
        },
      });
      expect(result.phone).toBe('+1234567890');
    });
  });

  describe('addSecondaryAuth', () => {
    const userId = 1;
    const addSecondaryDto: AddSecondaryAuthDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should add phone to user with only email', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        phone: '+1234567890',
        phone_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.addSecondaryAuth(
        userId,
        addSecondaryDto,
        'phone',
      );

      expect(
        mockAuthVerificationService.validateAuthMethodType,
      ).toHaveBeenCalledWith(mockPhoneAuthMethod, 'phone');
      expect(
        mockAuthVerificationService.validateUserHasNoExistingAuthMethod,
      ).toHaveBeenCalledWith(mockUser, 'phone');
      expect(
        mockAuthVerificationService.validateAuthIdentifierNotUsedByOthers,
      ).toHaveBeenCalledWith('+1234567890', 'phone', userId);
      expect(result.phone).toBe('+1234567890');
    });

    it('should add email to user with only phone', async () => {
      const phoneOnlyUser = {
        ...mockUser,
        email: null,
        phone: '+1234567890',
      };
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(phoneOnlyUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...phoneOnlyUser,
        email: 'test@gmail.com',
        email_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.addSecondaryAuth(
        userId,
        addSecondaryDto,
        'email',
      );

      expect(
        mockAuthVerificationService.validateAuthMethodType,
      ).toHaveBeenCalledWith(mockGoogleAuthMethod, 'email');
      expect(result.email).toBe('test@gmail.com');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.addSecondaryAuth(userId, addSecondaryDto, 'phone'),
      ).rejects.toThrow(new NotFoundException('User not found'));
    });

    it('should update user with new auth method', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockPhoneAuthMethod,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        phone: '+1234567890',
        phone_verified: true,
      });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      await service.addSecondaryAuth(userId, addSecondaryDto, 'phone');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: userId },
        data: {
          phone: '+1234567890',
          phone_verified: true,
        },
      });
    });
  });

  describe('devLogin', () => {
    it('should login with email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.devLogin({ identifier: 'test@example.com' });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
    });

    it('should login with phone', async () => {
      const phoneUser = { ...mockUser, email: null, phone: '+1234567890' };
      mockPrismaService.user.findUnique.mockResolvedValue(phoneUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.devLogin({ identifier: '+1234567890' });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '+1234567890' },
      });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.devLogin({ identifier: 'nonexistent@example.com' }),
      ).rejects.toThrow(new NotFoundException('User not found'));
    });
  });

  describe('signout', () => {
    it('should return placeholder message', async () => {
      const result = await service.signout();

      expect(result).toEqual({ message: 'Hello World' });
    });
  });

  describe('generateAuthResponse', () => {
    it('should include access token and user data', async () => {
      mockFirebaseService.validateFirebaseToken.mockResolvedValue({
        authMethod: mockGoogleAuthMethod,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('test-jwt-token');

      const result = await service.signin({
        uid: 'test-uid',
        uidToken: 'test-token',
      });

      expect(result).toHaveProperty('access_token', 'test-jwt-token');
      expect(result).toHaveProperty('user_id', mockUser.user_id);
      expect(result).toHaveProperty('email', mockUser.email);
    });
  });
});
