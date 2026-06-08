import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { UserProfile } from '@prisma/client';
import { ProfilesController } from '../profiles.controller';
import { ProfilesService } from '../profiles.service';
import { CreateProfileDto, PatchProfileDto, UpdateProfileDto } from '../dto';
import { ClsService } from 'nestjs-cls';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: jest.Mocked<ProfilesService>;

  const userId = 'user-id-123';
  const profileId = 'profile-id-123';

  const mockUserProfile: UserProfile = {
    id: profileId,
    userId,
    firstName: 'John',
    lastName: 'Doe',
    gender: null,
    dateOfBirth: DateUtil.parse('1990-01-01'),
    createdAt: DateUtil.now(),
    updatedAt: DateUtil.now(),
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

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ProfilesService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
    service = module.get(ProfilesService);
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
