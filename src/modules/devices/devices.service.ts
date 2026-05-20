import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Device, DevicePlatform } from '@prisma/client';
import { BaseService } from '@core/base';
import { Platform } from '@common/interfaces';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreateDeviceDto, PatchDeviceDto, UpdateDeviceDto } from './dto';

@Injectable()
export class DeviceService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Register a new device for the user
   */
  async createDevice(
    userId: string,
    createDeviceDto: CreateDeviceDto,
  ): Promise<Device> {
    this.logger.log(`Registering device for user: ${userId}`);

    const platform = this.mapPlatformToDevicePlatform(createDeviceDto.platform);

    try {
      const device = await this.prisma.device.create({
        data: {
          userId,
          ...createDeviceDto,
          platform,
        },
      });

      this.logger.log(
        `Device registered successfully for user: ${userId} (device: ${device.id})`,
      );
      return device;
    } catch (error) {
      const err = error as { code?: string; stack?: string };
      if (err.code === 'P2002') {
        // Unique constraint failed (likely token)
        this.logger.warn(
          `Device token already exists: ${createDeviceDto.token}`,
        );
        throw new ConflictException('A device with this token already exists');
      }
      this.logger.error(
        `Failed to register device for user ${userId}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Get all devices belonging to a user
   */
  async getUserDevices(userId: string): Promise<Device[]> {
    this.logger.log(`Fetching devices for user: ${userId}`);

    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single device by ID (must belong to the user)
   */
  async getDeviceById(userId: string, deviceId: string): Promise<Device> {
    this.logger.log(`Fetching device ${deviceId} for user: ${userId}`);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException(
        `Device not found or does not belong to user`,
      );
    }

    return device;
  }

  /**
   * Update a device (full replacement)
   */
  async updateDevice(
    userId: string,
    deviceId: string,
    updateDeviceDto: UpdateDeviceDto,
  ): Promise<Device> {
    this.logger.log(`Updating device ${deviceId} for user: ${userId}`);

    const platform = this.mapPlatformToDevicePlatform(updateDeviceDto.platform);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException(
        `Device not found or does not belong to user`,
      );
    }

    try {
      const updated = await this.prisma.device.update({
        where: { id: deviceId },
        data: {
          ...updateDeviceDto,
          platform,
        },
      });

      this.logger.log(`Device ${deviceId} updated successfully`);
      return updated;
    } catch (error) {
      const err = error as { code?: string; stack?: string };
      if (err.code === 'P2002') {
        this.logger.warn(
          `Device token conflict during update: ${updateDeviceDto.token}`,
        );
        throw new ConflictException('A device with this token already exists');
      }
      this.logger.error(`Failed to update device ${deviceId}`, err.stack);
      throw error;
    }
  }

  /**
   * Patch a device (partial update)
   */
  async patchDevice(
    userId: string,
    deviceId: string,
    patchDeviceDto: PatchDeviceDto,
  ): Promise<Device> {
    this.logger.log(`Patching device ${deviceId} for user: ${userId}`);

    const platform = this.mapPlatformToDevicePlatform(patchDeviceDto.platform);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException(
        `Device not found or does not belong to user`,
      );
    }

    try {
      const patched = await this.prisma.device.update({
        where: { id: deviceId },
        data: {
          ...patchDeviceDto,
          platform,
        },
      });

      this.logger.log(`Device ${deviceId} patched successfully`);
      return patched;
    } catch (error) {
      const err = error as { code?: string; stack?: string };
      if (err.code === 'P2002') {
        this.logger.warn(
          `Device token conflict during patch: ${patchDeviceDto.token}`,
        );
        throw new ConflictException('A device with this token already exists');
      }
      this.logger.error(`Failed to patch device ${deviceId}`, err.stack);
      throw error;
    }
  }

  /**
   * Delete a device
   */
  async deleteDevice(userId: string, deviceId: string): Promise<void> {
    this.logger.log(`Deleting device ${deviceId} for user: ${userId}`);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException(
        `Device not found or does not belong to user`,
      );
    }

    await this.prisma.device.delete({
      where: { id: deviceId },
    });

    this.logger.log(`Device ${deviceId} deleted successfully`);
  }

  private mapPlatformToDevicePlatform(
    platform: Platform | undefined,
  ): DevicePlatform {
    switch (platform) {
      case Platform.IOS:
        return DevicePlatform.IOS;
      case Platform.ANDROID:
        return DevicePlatform.ANDROID;
      default:
        // Fallback or throw if strict
        this.logger.warn(
          `Unknown platform: ${platform}, defaulting to ANDROID`,
        );
        return DevicePlatform.ANDROID;
    }
  }
}
