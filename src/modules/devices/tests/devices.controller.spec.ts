import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { DeviceController } from '../devices.controller';
import { DeviceService } from '../devices.service';
import { CreateDeviceDto, PatchDeviceDto, UpdateDeviceDto } from '../dto';
import { Platform } from '@common/interfaces';
import { DevicePlatform } from '@prisma/client';

describe('DeviceController', () => {
  let controller: DeviceController;
  let service: jest.Mocked<DeviceService>;
  let contextualLogger: any;
  let logger: any;

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
    };

    const mockService = {
      createDevice: jest.fn(),
      getUserDevices: jest.fn(),
      getDeviceById: jest.fn(),
      updateDevice: jest.fn(),
      patchDevice: jest.fn(),
      deleteDevice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [
        { provide: DeviceService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get<DeviceController>(DeviceController);
    service = module.get(DeviceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockDate = new Date();
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

  describe('registerDevice', () => {
    it('should register a device overriding fields with header values (all if branches covered)', async () => {
      const createDto: CreateDeviceDto = {
        deviceId: 'old-id',
        token: 'fcm-token',
        platform: Platform.ANDROID,
      };

      const userAgentData = {
        version: '2.0.0',
        platform: Platform.IOS,
      };

      service.createDevice.mockResolvedValue(mockDevice);

      const result = await controller.registerDevice(
        'user-1',
        'new-device-id',
        userAgentData as any,
        createDto,
      );

      expect(service.createDevice).toHaveBeenCalledWith('user-1', {
        deviceId: 'new-device-id',
        token: 'fcm-token',
        platform: Platform.IOS,
        appVersion: '2.0.0',
      });
      expect(result).toEqual(mockDevice);
    });

    it('should register a device covering edge cases for empty header values', async () => {
      const createDto: CreateDeviceDto = {
        deviceId: 'old-id',
        token: 'fcm-token',
        platform: Platform.ANDROID,
      };

      const userAgentData = {
        version: '2.0.0',
        platform: Platform.IOS,
      };

      service.createDevice.mockResolvedValue(mockDevice);

      const result = await controller.registerDevice(
        'user-1',
        'new-device-id',
        userAgentData as any,
        createDto,
      );

      expect(service.createDevice).toHaveBeenCalledWith('user-1', {
        deviceId: 'new-device-id',
        token: 'fcm-token',
        platform: Platform.IOS,
        appVersion: '2.0.0',
      });
      expect(result).toEqual(mockDevice);
    });

    it('should register a device missing version and platform in user agent', async () => {
      const createDto: CreateDeviceDto = {
        deviceId: 'original-id',
        token: 'fcm-token',
        platform: Platform.IOS,
        appVersion: '1.0.0',
      };

      const userAgentData = {};

      service.createDevice.mockResolvedValue(mockDevice);

      const result = await controller.registerDevice(
        'user-1',
        undefined as any,
        userAgentData as any,
        createDto,
      );

      expect(service.createDevice).toHaveBeenCalledWith('user-1', {
        deviceId: 'original-id',
        token: 'fcm-token',
        platform: Platform.IOS,
        appVersion: '1.0.0',
      });
      expect(result).toEqual(mockDevice);
    });
  });

  describe('getUserDevices', () => {
    it('should get devices for user', async () => {
      service.getUserDevices.mockResolvedValue([mockDevice]);

      const result = await controller.getUserDevices('user-1');

      expect(service.getUserDevices).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockDevice]);
    });
  });

  describe('getDeviceById', () => {
    it('should get device by id', async () => {
      service.getDeviceById.mockResolvedValue(mockDevice);

      const result = await controller.getDeviceById('user-1', 'device-id-123');

      expect(service.getDeviceById).toHaveBeenCalledWith(
        'user-1',
        'device-id-123',
      );
      expect(result).toEqual(mockDevice);
    });
  });

  describe('updateDevice', () => {
    it('should update device', async () => {
      const updateDto: UpdateDeviceDto = {
        deviceId: 'device-123',
        token: 'fcm-token-updated',
        platform: Platform.IOS,
        appVersion: '1.0.1',
      };

      service.updateDevice.mockResolvedValue({
        ...mockDevice,
        ...updateDto,
      } as any);

      const result = await controller.updateDevice(
        'user-1',
        'device-id-123',
        updateDto,
      );

      expect(service.updateDevice).toHaveBeenCalledWith(
        'user-1',
        'device-id-123',
        updateDto,
      );
      expect(result).toEqual({ ...mockDevice, ...updateDto });
    });
  });

  describe('patchDevice', () => {
    it('should patch device', async () => {
      const patchDto: PatchDeviceDto = {
        appVersion: '1.0.2',
      };

      service.patchDevice.mockResolvedValue({
        ...mockDevice,
        ...patchDto,
      } as any);

      const result = await controller.patchDevice(
        'user-1',
        'device-id-123',
        patchDto,
      );

      expect(service.patchDevice).toHaveBeenCalledWith(
        'user-1',
        'device-id-123',
        patchDto,
      );
      expect(result).toEqual({ ...mockDevice, ...patchDto });
    });
  });

  describe('deleteDevice', () => {
    it('should delete device', async () => {
      service.deleteDevice.mockResolvedValue(undefined);

      await controller.deleteDevice('user-1', 'device-id-123');

      expect(service.deleteDevice).toHaveBeenCalledWith(
        'user-1',
        'device-id-123',
      );
    });
  });
});
