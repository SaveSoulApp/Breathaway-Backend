import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@prisma/client';

import { Platform } from '@common/interfaces';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import { DeviceService } from '../devices.service';
import { CreateDeviceDto, PatchDeviceDto, UpdateDeviceDto } from '../dto';

describe('DeviceService', () => {
  let service: DeviceService;
  let prisma: MockPrismaService;
  let logger: jest.Mocked<LoggerService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<DeviceService>(DeviceService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockDate = DateUtil.now();
  const mockDevice = {
    id: 'device-id-123',
    userId: 'user-1',
    deviceId: 'device-123',
    token: 'fcm-token',
    platform: DevicePlatform.IOS,
    appVersion: '1.0.0',
    isActive: true,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  describe('createDevice', () => {
    const createDto: CreateDeviceDto = {
      deviceId: 'device-123',
      token: 'fcm-token',
      platform: Platform.IOS,
    };

    it('should create a new device successfully (IOS)', async () => {
      prisma.device.create.mockResolvedValue(mockDevice);

      const result = await service.createDevice('user-1', createDto);

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          ...createDto,
          platform: DevicePlatform.IOS,
        },
      });
      expect(result).toEqual(mockDevice);
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Registering device for user: user-1',
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Device registered successfully for user: user-1 (device: device-id-123)',
      );
    });

    it('should create a new device successfully (ANDROID)', async () => {
      const androidDto: CreateDeviceDto = {
        ...createDto,
        platform: Platform.ANDROID,
      };
      const androidMockDevice = {
        ...mockDevice,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.create.mockResolvedValue(androidMockDevice);

      const result = await service.createDevice('user-1', androidDto);

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          ...androidDto,
          platform: DevicePlatform.ANDROID,
        },
      });
      expect(result).toEqual(androidMockDevice);
    });

    it('should fallback to ANDROID if platform is unknown', async () => {
      const unknownDto: CreateDeviceDto = {
        ...createDto,
        platform: 'UNKNOWN_PLATFORM' as Platform,
      };
      const androidMockDevice = {
        ...mockDevice,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.create.mockResolvedValue(androidMockDevice);

      const result = await service.createDevice('user-1', unknownDto);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Unknown platform: UNKNOWN_PLATFORM, defaulting to ANDROID',
      );
      expect(prisma.device.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          ...unknownDto,
          platform: DevicePlatform.ANDROID,
        },
      });
      expect(result).toEqual(androidMockDevice);
    });

    it('should throw ConflictException on P2002 error', async () => {
      const error = new Error('Unique constraint failed');
      (error as unknown as { code: string }).code = 'P2002';
      prisma.device.create.mockRejectedValue(error);

      await expect(service.createDevice('user-1', createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device token already exists: fcm-token',
      );
    });

    it('should re-throw other errors', async () => {
      const error = new Error('Some database error');
      prisma.device.create.mockRejectedValue(error);

      await expect(service.createDevice('user-1', createDto)).rejects.toThrow(
        error,
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to register device for user user-1',
        { stack: error.stack },
      );
    });
  });

  describe('getUserDevices', () => {
    it('should fetch all devices for a user', async () => {
      prisma.device.findMany.mockResolvedValue([mockDevice]);

      const result = await service.getUserDevices('user-1');

      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockDevice]);
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Fetching devices for user: user-1',
      );
    });
  });

  describe('getDeviceById', () => {
    it('should fetch device by ID', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);

      const result = await service.getDeviceById('user-1', 'device-id-123');

      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'device-id-123', userId: 'user-1' },
      });
      expect(result).toEqual(mockDevice);
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Fetching device device-id-123 for user: user-1',
      );
    });

    it('should throw NotFoundException if device is missing', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.getDeviceById('user-1', 'device-id-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateDevice', () => {
    const updateDto: UpdateDeviceDto = {
      deviceId: 'device-123-updated',
      token: 'fcm-token-updated',
      platform: Platform.IOS,
      appVersion: '1.0.1',
    };

    it('should update the device successfully (IOS)', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const updatedMock = {
        ...mockDevice,
        ...updateDto,
        platform: DevicePlatform.IOS,
      };
      prisma.device.update.mockResolvedValue(updatedMock);

      const result = await service.updateDevice(
        'user-1',
        'device-id-123',
        updateDto,
      );

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-id-123' },
        data: {
          ...updateDto,
          platform: DevicePlatform.IOS,
        },
      });
      expect(result).toEqual(updatedMock);
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Device device-id-123 updated successfully',
      );
    });

    it('should update the device successfully (ANDROID)', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const androidDto: UpdateDeviceDto = {
        ...updateDto,
        platform: Platform.ANDROID,
      };
      const updatedMock = {
        ...mockDevice,
        ...androidDto,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.update.mockResolvedValue(updatedMock);

      const result = await service.updateDevice(
        'user-1',
        'device-id-123',
        androidDto,
      );

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-id-123' },
        data: {
          ...androidDto,
          platform: DevicePlatform.ANDROID,
        },
      });
      expect(result).toEqual(updatedMock);
    });

    it('should fallback to ANDROID if platform is unknown on update', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const unknownDto: UpdateDeviceDto = {
        ...updateDto,
        platform: 'UNKNOWN' as Platform,
      };
      const updatedMock = {
        ...mockDevice,
        ...unknownDto,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.update.mockResolvedValue(updatedMock);

      const result = await service.updateDevice(
        'user-1',
        'device-id-123',
        unknownDto,
      );

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-id-123' },
        data: {
          ...unknownDto,
          platform: DevicePlatform.ANDROID,
        },
      });
      expect(result).toEqual(updatedMock);
    });

    it('should throw NotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDevice('user-1', 'device-id-123', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on P2002 error', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const error = new Error('Unique constraint failed');
      (error as unknown as { code: string }).code = 'P2002';
      prisma.device.update.mockRejectedValue(error);

      await expect(
        service.updateDevice('user-1', 'device-id-123', updateDto),
      ).rejects.toThrow(ConflictException);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device token conflict during update: fcm-token-updated',
      );
    });

    it('should re-throw other errors', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const error = new Error('Some database error');
      prisma.device.update.mockRejectedValue(error);

      await expect(
        service.updateDevice('user-1', 'device-id-123', updateDto),
      ).rejects.toThrow(error);
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to update device device-id-123',
        { stack: error.stack },
      );
    });
  });

  describe('patchDevice', () => {
    const patchDto: PatchDeviceDto = {
      platform: Platform.IOS,
      appVersion: '1.0.2',
    };

    it('should patch the device successfully (IOS)', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const patchedMock = {
        ...mockDevice,
        ...patchDto,
        platform: DevicePlatform.IOS,
      };
      prisma.device.update.mockResolvedValue(patchedMock);

      const result = await service.patchDevice(
        'user-1',
        'device-id-123',
        patchDto,
      );

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-id-123' },
        data: {
          ...patchDto,
          platform: DevicePlatform.IOS,
        },
      });
      expect(result).toEqual(patchedMock);
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Device device-id-123 patched successfully',
      );
    });

    it('should patch the device successfully (ANDROID)', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const androidDto: PatchDeviceDto = {
        ...patchDto,
        platform: Platform.ANDROID,
      };
      const patchedMock = {
        ...mockDevice,
        ...androidDto,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.update.mockResolvedValue(patchedMock);

      const result = await service.patchDevice(
        'user-1',
        'device-id-123',
        androidDto,
      );

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-id-123' },
        data: {
          ...androidDto,
          platform: DevicePlatform.ANDROID,
        },
      });
      expect(result).toEqual(patchedMock);
    });

    it('should patch the device and fallback to ANDROID if platform is unknown', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const unknownDto: PatchDeviceDto = {
        ...patchDto,
        platform: 'UNKNOWN' as Platform,
      };
      const patchedMock = {
        ...mockDevice,
        ...unknownDto,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.update.mockResolvedValue(patchedMock);

      const result = await service.patchDevice(
        'user-1',
        'device-id-123',
        unknownDto,
      );

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-id-123' },
        data: {
          ...unknownDto,
          platform: DevicePlatform.ANDROID,
        },
      });
      expect(result).toEqual(patchedMock);
    });

    it('should throw NotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.patchDevice('user-1', 'device-id-123', patchDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on P2002 error', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const patchDtoWithToken: PatchDeviceDto = { token: 'new-token' };
      const error = new Error('Unique constraint failed');
      (error as unknown as { code: string }).code = 'P2002';
      prisma.device.update.mockRejectedValue(error);

      await expect(
        service.patchDevice('user-1', 'device-id-123', patchDtoWithToken),
      ).rejects.toThrow(ConflictException);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device token conflict during patch: new-token',
      );
    });

    it('should re-throw other errors', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const error = new Error('Some database error');
      prisma.device.update.mockRejectedValue(error);

      await expect(
        service.patchDevice('user-1', 'device-id-123', patchDto),
      ).rejects.toThrow(error);
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to patch device device-id-123',
        { stack: error.stack },
      );
    });
  });

  describe('deleteDevice', () => {
    it('should delete the device successfully', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      prisma.device.delete.mockResolvedValue(mockDevice);

      await service.deleteDevice('user-1', 'device-id-123');

      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'device-id-123', userId: 'user-1' },
      });
      expect(prisma.device.delete).toHaveBeenCalledWith({
        where: { id: 'device-id-123' },
      });
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Device device-id-123 deleted successfully',
      );
    });

    it('should throw NotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteDevice('user-1', 'device-id-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
