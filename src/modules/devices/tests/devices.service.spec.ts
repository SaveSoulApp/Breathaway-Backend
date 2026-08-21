import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { Platform } from '@common/interfaces';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import {
  DeviceNotFoundException,
  DeviceTokenAlreadyExistsException,
} from '../application/exceptions';
import { DevicesService } from '../devices.service';
import {
  CreateDeviceRequestDto,
  PatchDeviceRequestDto,
  UpdateDeviceRequestDto,
} from '../dto';

describe('DevicesService', () => {
  let service: DevicesService;
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
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        DevicesService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
    prisma = module.get(PrismaService);

    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return cb;
    });
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
    const createDto: CreateDeviceRequestDto = {
      deviceId: 'device-123',
      token: 'fcm-token',
      platform: Platform.IOS,
      appVersion: '1.0.0',
    };

    it('should create a new device successfully when token does not exist', async () => {
      prisma.device.findUnique.mockResolvedValue(null);
      prisma.device.create.mockResolvedValue(mockDevice);
      prisma.device.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.createDevice('user-1', createDto);

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          deviceId: 'device-123',
          token: { not: 'fcm-token' },
          isActive: true,
        },
        data: { isActive: false },
      });
      expect(prisma.device.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          token: 'fcm-token',
          platform: DevicePlatform.IOS,
          deviceId: 'device-123',
          appVersion: '1.0.0',
          isActive: true,
        },
      });
      expect(result).toEqual(mockDevice);
    });

    it('should update existing device and transfer ownership when token already exists', async () => {
      const existingDevice = {
        ...mockDevice,
        userId: 'previous-user',
        isActive: false,
      };
      const updatedDevice = {
        ...mockDevice,
        userId: 'user-1',
        isActive: true,
      };

      prisma.device.findUnique.mockResolvedValue(existingDevice);
      prisma.device.update.mockResolvedValue(updatedDevice);
      prisma.device.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.createDevice('user-1', createDto);

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: existingDevice.id },
        data: {
          userId: 'user-1',
          platform: DevicePlatform.IOS,
          deviceId: 'device-123',
          appVersion: '1.0.0',
          isActive: true,
        },
      });
      expect(prisma.device.create).not.toHaveBeenCalled();
      expect(result).toEqual(updatedDevice);
    });

    it('should create a new device successfully (ANDROID)', async () => {
      const androidDto: CreateDeviceRequestDto = {
        ...createDto,
        platform: Platform.ANDROID,
      };
      const androidMockDevice = {
        ...mockDevice,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.findUnique.mockResolvedValue(null);
      prisma.device.create.mockResolvedValue(androidMockDevice);
      prisma.device.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.createDevice('user-1', androidDto);

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          token: 'fcm-token',
          platform: DevicePlatform.ANDROID,
          deviceId: 'device-123',
          appVersion: '1.0.0',
          isActive: true,
        },
      });
      expect(result).toEqual(androidMockDevice);
    });

    it('should fallback to ANDROID if platform is unknown', async () => {
      const unknownDto: CreateDeviceRequestDto = {
        ...createDto,
        platform: 'UNKNOWN_PLATFORM' as Platform,
      };
      const androidMockDevice = {
        ...mockDevice,
        platform: DevicePlatform.ANDROID,
      };
      prisma.device.findUnique.mockResolvedValue(null);
      prisma.device.create.mockResolvedValue(androidMockDevice);
      prisma.device.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.createDevice('user-1', unknownDto);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Unknown platform, defaulting to ANDROID',
        { platform: 'UNKNOWN_PLATFORM', step: 'map_platform' },
      );
      expect(result).toEqual(androidMockDevice);
    });

    it('should handle P2002 race condition by falling back to update', async () => {
      const p2002Error = new Error('Unique constraint failed');
      (p2002Error as unknown as { code: string }).code = 'P2002';

      prisma.$transaction.mockRejectedValue(p2002Error);
      prisma.device.update.mockResolvedValue(mockDevice);

      const result = await service.createDevice('user-1', createDto);

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { token: 'fcm-token' },
        data: {
          userId: 'user-1',
          platform: DevicePlatform.IOS,
          deviceId: 'device-123',
          appVersion: '1.0.0',
          isActive: true,
        },
      });
      expect(result).toEqual(mockDevice);
    });

    it('should re-throw other errors', async () => {
      const error = new Error('Some database error');
      prisma.$transaction.mockRejectedValue(error);

      await expect(service.createDevice('user-1', createDto)).rejects.toThrow(
        error,
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to register device',
        expect.objectContaining({
          userId: 'user-1',
          devicePlatform: Platform.IOS,
          step: 'persist_device',
          err: expect.objectContaining({
            message: error.message,
            name: error.name,
            stack: error.stack,
          }),
        }),
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
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Fetching user devices',
        {
          userId: 'user-1',
          step: 'fetch',
        },
      );
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'User devices fetched successfully',
        {
          userId: 'user-1',
          step: 'complete',
          count: 1,
        },
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
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Fetching device by ID',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'fetch',
        },
      );
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Device fetched successfully',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'complete',
        },
      );
    });

    it('should throw DeviceNotFoundException if device is missing', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.getDeviceById('user-1', 'device-id-123'),
      ).rejects.toThrow(DeviceNotFoundException);
      expect(contextualLogger.warn).toHaveBeenCalledWith('Device not found', {
        userId: 'user-1',
        deviceId: 'device-id-123',
        step: 'fetch',
      });
    });
  });

  describe('updateDevice', () => {
    const updateDto: UpdateDeviceRequestDto = {
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
        'Device update started',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'init',
        },
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Device updated successfully',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'complete',
        },
      );
    });

    it('should update the device successfully (ANDROID)', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const androidDto: UpdateDeviceRequestDto = {
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
      const unknownDto: UpdateDeviceRequestDto = {
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

    it('should throw DeviceNotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDevice('user-1', 'device-id-123', updateDto),
      ).rejects.toThrow(DeviceNotFoundException);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device not found for update',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'existence_check',
        },
      );
    });

    it('should throw DeviceTokenAlreadyExistsException on P2002 error', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const error = new Error('Unique constraint failed');
      (error as unknown as { code: string }).code = 'P2002';
      prisma.device.update.mockRejectedValue(error);

      await expect(
        service.updateDevice('user-1', 'device-id-123', updateDto),
      ).rejects.toThrow(DeviceTokenAlreadyExistsException);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device token conflict during update',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'duplicate_check',
        },
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
        'Failed to update device',
        expect.objectContaining({
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'persist_device',
          err: expect.objectContaining({
            message: error.message,
            name: error.name,
            stack: error.stack,
          }),
        }),
      );
    });
  });

  describe('patchDevice', () => {
    const patchDto: PatchDeviceRequestDto = {
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
        'Device patch started',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'init',
        },
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Device patched successfully',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'complete',
        },
      );
    });

    it('should patch the device successfully (ANDROID)', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const androidDto: PatchDeviceRequestDto = {
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
      const unknownDto: PatchDeviceRequestDto = {
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

    it('should throw DeviceNotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.patchDevice('user-1', 'device-id-123', patchDto),
      ).rejects.toThrow(DeviceNotFoundException);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device not found for patch',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'existence_check',
        },
      );
    });

    it('should throw DeviceTokenAlreadyExistsException on P2002 error', async () => {
      prisma.device.findFirst.mockResolvedValue(mockDevice);
      const patchDtoWithToken: PatchDeviceRequestDto = { token: 'new-token' };
      const error = new Error('Unique constraint failed');
      (error as unknown as { code: string }).code = 'P2002';
      prisma.device.update.mockRejectedValue(error);

      await expect(
        service.patchDevice('user-1', 'device-id-123', patchDtoWithToken),
      ).rejects.toThrow(DeviceTokenAlreadyExistsException);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device token conflict during patch',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'duplicate_check',
        },
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
        'Failed to patch device',
        expect.objectContaining({
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'persist_device',
          err: expect.objectContaining({
            message: error.message,
            name: error.name,
            stack: error.stack,
          }),
        }),
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
        'Device deletion started',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'init',
        },
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Device deleted successfully',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'complete',
        },
      );
    });

    it('should throw DeviceNotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteDevice('user-1', 'device-id-123'),
      ).rejects.toThrow(DeviceNotFoundException);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Device not found for deletion',
        {
          userId: 'user-1',
          deviceId: 'device-id-123',
          step: 'existence_check',
        },
      );
    });
  });
});
