import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { UserProfile } from '@prisma/client';
import { ProfileController } from '../profiles.controller';
import { ProfileService } from '../profiles.service';
import { CreateProfileDto, PatchProfileDto, UpdateProfileDto } from '../dto';

describe('ProfileController', () => {
  let controller: any;
  let service: any;
  let loggerServiceMock: any;

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
    const mockService = {
      createProfile: jest.fn(),
      getProfileByUserId: jest.fn(),
      getProfileById: jest.fn(),
      updateProfile: jest.fn(),
      patchProfile: jest.fn(),
      deleteProfile: jest.fn(),
    };

    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
    service = module.get(ProfileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    it('should successfully create and return a profile', async () => {
      // Arrange
      const createDto: CreateProfileDto = {
        firstName: 'John',
        lastName: 'Doe',
      };
      service.createProfile.mockResolvedValue(mockUserProfile);

      // Act
      const result = await controller.createProfile(userId, createDto);

      // Assert
      expect(service.createProfile).toHaveBeenCalledWith(userId, createDto);
      expect(result).toEqual(mockUserProfile);
    });
  });

  describe('getMyProfile', () => {
    it('should retrieve and return the user profile', async () => {
      // Arrange
      service.getProfileByUserId.mockResolvedValue(mockUserProfile);

      // Act
      const result = await controller.getMyProfile(userId);

      // Assert
      expect(service.getProfileByUserId).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockUserProfile);
    });
  });

  describe('getProfileById', () => {
    it('should retrieve and return the profile by id', async () => {
      // Arrange
      service.getProfileById.mockResolvedValue(mockUserProfile);

      // Act
      const result = await controller.getProfileById(profileId);

      // Assert
      expect(service.getProfileById).toHaveBeenCalledWith(profileId);
      expect(result).toEqual(mockUserProfile);
    });
  });

  describe('updateProfile', () => {
    it('should successfully update and return the profile', async () => {
      // Arrange
      const updateDto: UpdateProfileDto = {
        firstName: 'Jane',
        lastName: 'Doe',
      };
      const updatedProfile = { ...mockUserProfile, firstName: 'Jane' };
      service.updateProfile.mockResolvedValue(updatedProfile);

      // Act
      const result = await controller.updateProfile(userId, updateDto);

      // Assert
      expect(service.updateProfile).toHaveBeenCalledWith(userId, updateDto);
      expect(result).toEqual(updatedProfile);
    });
  });

  describe('patchProfile', () => {
    it('should successfully patch and return the profile', async () => {
      // Arrange
      const patchDto: PatchProfileDto = {
        firstName: 'Jane',
      };
      const patchedProfile = { ...mockUserProfile, firstName: 'Jane' };
      service.patchProfile.mockResolvedValue(patchedProfile);

      // Act
      const result = await controller.patchProfile(userId, patchDto);

      // Assert
      expect(service.patchProfile).toHaveBeenCalledWith(userId, patchDto);
      expect(result).toEqual(patchedProfile);
    });
  });

  describe('deleteProfile', () => {
    it('should successfully delete the profile', async () => {
      // Arrange
      service.deleteProfile.mockResolvedValue(undefined);

      // Act
      await controller.deleteProfile(userId);

      // Assert
      expect(service.deleteProfile).toHaveBeenCalledWith(userId);
    });
  });
});
