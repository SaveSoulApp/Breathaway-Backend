import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AuthVerificationService } from '../auth-verification.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { AuthMethod } from '../utils/auth-method.utils';

describe('AuthVerificationService', () => {
  let service: AuthVerificationService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthVerificationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuthVerificationService>(AuthVerificationService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAuthMethodType', () => {
    it('should succeed when phone auth method matches phone type', () => {
      const authMethod = {
        method: AuthMethod.PHONE,
        identifier: '+1234567890',
        isVerified: true,
      };

      expect(() =>
        service.validateAuthMethodType(authMethod, 'phone'),
      ).not.toThrow();
    });

    it('should succeed when Google auth method matches email type', () => {
      const authMethod = {
        method: AuthMethod.GOOGLE,
        identifier: 'test@gmail.com',
        isVerified: true,
      };

      expect(() =>
        service.validateAuthMethodType(authMethod, 'email'),
      ).not.toThrow();
    });

    it('should throw BadRequestException when expecting phone but got Google', () => {
      const authMethod = {
        method: AuthMethod.GOOGLE,
        identifier: 'test@gmail.com',
        isVerified: true,
      };

      expect(() => service.validateAuthMethodType(authMethod, 'phone')).toThrow(
        new BadRequestException('Expected phone authentication method'),
      );
    });

    it('should throw BadRequestException when expecting email but got phone', () => {
      const authMethod = {
        method: AuthMethod.PHONE,
        identifier: '+1234567890',
        isVerified: true,
      };

      expect(() => service.validateAuthMethodType(authMethod, 'email')).toThrow(
        new BadRequestException('Expected Google authentication method'),
      );
    });

    it('should throw BadRequestException when expecting phone but got email', () => {
      const authMethod = {
        method: AuthMethod.EMAIL,
        identifier: 'test@example.com',
        isVerified: true,
      };

      expect(() => service.validateAuthMethodType(authMethod, 'phone')).toThrow(
        new BadRequestException('Expected phone authentication method'),
      );
    });
  });

  describe('validateUserHasNoExistingAuthMethod', () => {
    it('should succeed when user has no phone and adding phone', () => {
      const user = { ...mockUser, phone: null };

      expect(() =>
        service.validateUserHasNoExistingAuthMethod(user, 'phone'),
      ).not.toThrow();
    });

    it('should succeed when user has no email and adding email', () => {
      const user = { ...mockUser, email: null, phone: '+1234567890' };

      expect(() =>
        service.validateUserHasNoExistingAuthMethod(user, 'email'),
      ).not.toThrow();
    });

    it('should throw ConflictException when user already has phone', () => {
      const user = { ...mockUser, phone: '+1234567890' };

      expect(() =>
        service.validateUserHasNoExistingAuthMethod(user, 'phone'),
      ).toThrow(
        new ConflictException('Phone number already exists for this user'),
      );
    });

    it('should throw ConflictException when user already has email', () => {
      const user = { ...mockUser, email: 'test@example.com' };

      expect(() =>
        service.validateUserHasNoExistingAuthMethod(user, 'email'),
      ).toThrow(new ConflictException('Email already exists for this user'));
    });
  });

  describe('validateAuthIdentifierNotUsedByOthers', () => {
    const currentUserId = 1;

    it('should succeed when phone not used by any user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateAuthIdentifierNotUsedByOthers(
          '+1234567890',
          'phone',
          currentUserId,
        ),
      ).resolves.not.toThrow();

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '+1234567890' },
      });
    });

    it('should succeed when email not used by any user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateAuthIdentifierNotUsedByOthers(
          'test@example.com',
          'email',
          currentUserId,
        ),
      ).resolves.not.toThrow();

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should succeed when phone belongs to current user', async () => {
      const user = { ...mockUser, user_id: currentUserId };
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(
        service.validateAuthIdentifierNotUsedByOthers(
          '+1234567890',
          'phone',
          currentUserId,
        ),
      ).resolves.not.toThrow();
    });

    it('should succeed when email belongs to current user', async () => {
      const user = { ...mockUser, user_id: currentUserId };
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(
        service.validateAuthIdentifierNotUsedByOthers(
          'test@example.com',
          'email',
          currentUserId,
        ),
      ).resolves.not.toThrow();
    });

    it('should throw ConflictException when phone used by another user', async () => {
      const otherUser = { ...mockUser, user_id: 999 };
      mockPrismaService.user.findUnique.mockResolvedValue(otherUser);

      await expect(
        service.validateAuthIdentifierNotUsedByOthers(
          '+1234567890',
          'phone',
          currentUserId,
        ),
      ).rejects.toThrow(
        new ConflictException('Phone number already used by another user'),
      );
    });

    it('should throw ConflictException when email used by another user', async () => {
      const otherUser = { ...mockUser, user_id: 999 };
      mockPrismaService.user.findUnique.mockResolvedValue(otherUser);

      await expect(
        service.validateAuthIdentifierNotUsedByOthers(
          'test@example.com',
          'email',
          currentUserId,
        ),
      ).rejects.toThrow(
        new ConflictException('Email already used by another user'),
      );
    });
  });
});
