import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserProfile } from '@prisma/client';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { CreateProfileDto, PatchProfileDto, UpdateProfileDto } from '../dto';
import { ProfileService } from '../profiles.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: MockPrismaService;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const userId = 'user-id-123';
  const profileId = 'profile-id-123';

  const mockUserProfile: UserProfile = {
    id: profileId,
    userId,
    firstName: 'John',
    lastName: 'Doe',
    gender: null,
    dateOfBirth: new Date('1990-01-01'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    const createDto: CreateProfileDto = {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-01T00:00:00.000Z',
    };

    it('should successfully create a profile', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.userProfile.create.mockResolvedValue(mockUserProfile);

      // Act
      const result = await service.createProfile(userId, createDto);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.userProfile.create).toHaveBeenCalledWith({
        data: {
          userId,
          ...createDto,
          dateOfBirth: new Date(createDto.dateOfBirth!),
        },
      });
      expect(result).toEqual(mockUserProfile);
    });

    it('should successfully create a profile without dateOfBirth', async () => {
      // Arrange
      const dtoWithoutDob: CreateProfileDto = {
        firstName: 'John',
        lastName: 'Doe',
      };
      const profileWithoutDob = { ...mockUserProfile, dateOfBirth: null };

      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.userProfile.create.mockResolvedValue(profileWithoutDob);

      // Act
      const result = await service.createProfile(userId, dtoWithoutDob);

      // Assert
      expect(prisma.userProfile.create).toHaveBeenCalledWith({
        data: {
          userId,
          ...dtoWithoutDob,
          dateOfBirth: null,
        },
      });
      expect(result).toEqual(profileWithoutDob);
    });

    it('should throw ConflictException if profile already exists', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);

      // Act & Assert
      await expect(service.createProfile(userId, createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.userProfile.create).not.toHaveBeenCalled();
    });

    it('should log and rethrow an error if create fails', async () => {
      // Arrange
      const dbError = new Error('Database Error');
      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.userProfile.create.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.createProfile(userId, createDto)).rejects.toThrow(
        dbError,
      );
      expect(
        loggerServiceMock.forContext('ProfileService').error,
      ).toHaveBeenCalled();
    });
  });

  describe('getProfileByUserId', () => {
    it('should return profile if exists', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);

      // Act
      const result = await service.getProfileByUserId(userId);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(result).toEqual(mockUserProfile);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getProfileByUserId(userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });

  describe('getProfileById', () => {
    it('should return profile if exists', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);

      // Act
      const result = await service.getProfileById(profileId);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { id: profileId },
      });
      expect(result).toEqual(mockUserProfile);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getProfileById(profileId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { id: profileId },
      });
    });
  });

  describe('updateProfile', () => {
    const updateDto: UpdateProfileDto = {
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1995-01-01T00:00:00.000Z',
    };

    it('should update and return profile if exists', async () => {
      // Arrange
      const updatedProfile = {
        ...mockUserProfile,
        firstName: 'Jane',
        dateOfBirth: new Date('1995-01-01'),
      };
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.update.mockResolvedValue(updatedProfile);

      // Act
      const result = await service.updateProfile(userId, updateDto);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId },
        data: {
          ...updateDto,
          dateOfBirth: new Date(updateDto.dateOfBirth!),
        },
      });
      expect(result).toEqual(updatedProfile);
    });

    it('should handle update without dateOfBirth', async () => {
      // Arrange
      const dtoWithoutDob: UpdateProfileDto = {
        firstName: 'Jane',
        lastName: 'Doe',
      };
      const updatedProfile = {
        ...mockUserProfile,
        firstName: 'Jane',
        dateOfBirth: null,
      };
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.update.mockResolvedValue(updatedProfile);

      // Act
      const result = await service.updateProfile(userId, dtoWithoutDob);

      // Assert
      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId },
        data: {
          ...dtoWithoutDob,
          dateOfBirth: null,
        },
      });
      expect(result).toEqual(updatedProfile);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateProfile(userId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userProfile.update).not.toHaveBeenCalled();
    });

    it('should log and rethrow an error if update fails', async () => {
      // Arrange
      const dbError = new Error('Database Error');
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.update.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.updateProfile(userId, updateDto)).rejects.toThrow(
        dbError,
      );
      expect(
        loggerServiceMock.forContext('ProfileService').error,
      ).toHaveBeenCalled();
    });
  });

  describe('patchProfile', () => {
    const patchDto: PatchProfileDto = {
      firstName: 'Jane',
    };

    it('should patch and return profile if exists', async () => {
      // Arrange
      const patchedProfile = { ...mockUserProfile, firstName: 'Jane' };
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.update.mockResolvedValue(patchedProfile);

      // Act
      const result = await service.patchProfile(userId, patchDto);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId },
        data: { ...patchDto },
      });
      expect(result).toEqual(patchedProfile);
    });

    it('should handle patching dateOfBirth', async () => {
      // Arrange
      const dtoWithDob: PatchProfileDto = {
        dateOfBirth: '1995-01-01T00:00:00.000Z',
      };
      const patchedProfile = {
        ...mockUserProfile,
        dateOfBirth: new Date(dtoWithDob.dateOfBirth!),
      };
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.update.mockResolvedValue(patchedProfile);

      // Act
      const result = await service.patchProfile(userId, dtoWithDob);

      // Assert
      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId },
        data: {
          dateOfBirth: new Date(dtoWithDob.dateOfBirth!),
        },
      });
      expect(result).toEqual(patchedProfile);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.patchProfile(userId, patchDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userProfile.update).not.toHaveBeenCalled();
    });

    it('should log and rethrow an error if patch fails', async () => {
      // Arrange
      const dbError = new Error('Database Error');
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.update.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.patchProfile(userId, patchDto)).rejects.toThrow(
        dbError,
      );
      expect(
        loggerServiceMock.forContext('ProfileService').error,
      ).toHaveBeenCalled();
    });
  });

  describe('deleteProfile', () => {
    it('should delete profile if exists', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.delete.mockResolvedValue(mockUserProfile);

      // Act
      await service.deleteProfile(userId);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.userProfile.delete).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteProfile(userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userProfile.delete).not.toHaveBeenCalled();
    });

    it('should log and rethrow an error if delete fails', async () => {
      // Arrange
      const dbError = new Error('Database Error');
      prisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
      prisma.userProfile.delete.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.deleteProfile(userId)).rejects.toThrow(dbError);
      expect(
        loggerServiceMock.forContext('ProfileService').error,
      ).toHaveBeenCalled();
    });
  });

  describe('profileExists', () => {
    it('should return true if profile exists', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue({ userId } as any);

      // Act
      const result = await service.profileExists(userId);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
        select: { userId: true },
      });
      expect(result).toBe(true);
    });

    it('should return false if profile does not exist', async () => {
      // Arrange
      prisma.userProfile.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.profileExists(userId);

      // Assert
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId },
        select: { userId: true },
      });
      expect(result).toBe(false);
    });
  });
});
