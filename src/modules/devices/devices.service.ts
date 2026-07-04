import { Injectable } from '@nestjs/common';
import { Device, DevicePlatform } from '@prisma/client';

import { Platform } from '@common/interfaces';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import {
  DeviceNotFoundException,
  DeviceTokenAlreadyExistsException,
} from './application/exceptions';
import {
  CreateDeviceRequestDto,
  PatchDeviceRequestDto,
  UpdateDeviceRequestDto,
} from './dto';

/**
 * Owns the business logic for device registration, retrieval, modification, and removal.
 *
 * Enforces per-user ownership on all operations — methods that target a specific device
 * by ID will reject the request if the device belongs to a different user. Platform
 * mapping from the common `Platform` enum to the Prisma `DevicePlatform` enum is
 * centralized here to keep DTOs framework-agnostic.
 */
@Injectable()
export class DevicesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Registers a new push notification device for a user and emits a DEVICE_REGISTERED audit event.
   *
   * Catches Prisma unique-constraint errors (P2002) on the token field and converts them
   * to a ConflictException so the caller receives a clean 409 rather than a raw DB error.
   *
   * @param userId - UUID of the user registering the device.
   * @param createDeviceDto - Push token, platform, and optional device metadata.
   * @returns The persisted Device entity including its generated ULID.
   * @throws {ConflictException} When a device with the same push token already exists.
   */
  async createDevice(
    userId: string,
    createDeviceDto: CreateDeviceRequestDto,
  ): Promise<Device> {
    const ctx = { userId, devicePlatform: createDeviceDto.platform };
    this.logger.log('Device registration started', { ...ctx, step: 'init' });

    const platform = this.mapPlatformToDevicePlatform(createDeviceDto.platform);

    try {
      const device = await this.prisma.device.create({
        data: {
          userId,
          ...createDeviceDto,
          platform,
        },
      });

      this.logger.debug('Device record persisted', {
        ...ctx,
        step: 'persist_device',
        deviceId: device.id,
      });

      this.emitAuditLog({
        actionType: AuditActionType.DEVICE_REGISTERED,
        userId: userId,
        resourceId: device.id,
        metadata: {
          deviceId: device.deviceId,
          platform: device.platform,
          appVersion: device.appVersion,
        },
      });

      this.logger.log('Device registered successfully', {
        ...ctx,
        step: 'complete',
        deviceId: device.id,
      });
      return device;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'P2002') {
        // Unique constraint failed (likely token). Do NOT log the token itself (PII compliance).
        this.logger.warn('Device token already exists', {
          ...ctx,
          step: 'duplicate_check',
        });
        throw new DeviceTokenAlreadyExistsException();
      }
      this.logger.error('Failed to register device', {
        ...ctx,
        step: 'persist_device',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Returns all devices belonging to a user, ordered by most recently registered first.
   *
   * @param userId - UUID of the user whose devices to list.
   * @returns An array of Device entities; empty array if the user has no registered devices.
   */
  async getUserDevices(userId: string): Promise<Device[]> {
    const ctx = { userId };
    this.logger.debug('Fetching user devices', { ...ctx, step: 'fetch' });

    const devices = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    this.logger.debug('User devices fetched successfully', {
      ...ctx,
      step: 'complete',
      count: devices.length,
    });
    return devices;
  }

  /**
   * Retrieves a single device by its ID, scoped to the owning user.
   *
   * Uses `findFirst` with a composite `id + userId` filter rather than `findUnique`
   * to enforce ownership without an additional authorization layer.
   *
   * @param userId - UUID of the user requesting the device.
   * @param deviceId - ULID of the device record to retrieve.
   * @returns The matching Device entity.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   */
  async getDeviceById(userId: string, deviceId: string): Promise<Device> {
    const ctx = { userId, deviceId };
    this.logger.debug('Fetching device by ID', { ...ctx, step: 'fetch' });

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      this.logger.warn('Device not found', { ...ctx, step: 'fetch' });
      throw new DeviceNotFoundException();
    }

    this.logger.debug('Device fetched successfully', {
      ...ctx,
      step: 'complete',
    });
    return device;
  }

  /**
   * Fully replaces a device record's persisted fields with the provided payload.
   *
   * Ownership is verified before the update. Catches P2002 token conflicts and
   * surfaces them as ConflictException to prevent opaque 500 responses.
   *
   * @param userId - UUID of the owning user.
   * @param deviceId - ULID of the device to update.
   * @param updateDeviceDto - Complete replacement payload; all fields are applied.
   * @returns The updated Device entity.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   * @throws {ConflictException} When the new token is already in use by another device.
   */
  async updateDevice(
    userId: string,
    deviceId: string,
    updateDeviceDto: UpdateDeviceRequestDto,
  ): Promise<Device> {
    const ctx = { userId, deviceId };
    this.logger.log('Device update started', { ...ctx, step: 'init' });

    const platform = this.mapPlatformToDevicePlatform(updateDeviceDto.platform);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      this.logger.warn('Device not found for update', {
        ...ctx,
        step: 'existence_check',
      });
      throw new DeviceNotFoundException();
    }
    this.logger.debug('Device existence verified', {
      ...ctx,
      step: 'existence_check',
    });

    try {
      const updated = await this.prisma.device.update({
        where: { id: deviceId },
        data: {
          ...updateDeviceDto,
          platform,
        },
      });

      this.logger.debug('Device record updated', {
        ...ctx,
        step: 'persist_device',
      });

      this.logger.log('Device updated successfully', {
        ...ctx,
        step: 'complete',
      });
      return updated;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'P2002') {
        // Do NOT log the token itself (PII compliance)
        this.logger.warn('Device token conflict during update', {
          ...ctx,
          step: 'duplicate_check',
        });
        throw new DeviceTokenAlreadyExistsException();
      }
      this.logger.error('Failed to update device', {
        ...ctx,
        step: 'persist_device',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Applies a partial update to a device record, leaving unspecified fields unchanged.
   *
   * Ownership is verified before the patch. Catches P2002 token conflicts and surfaces
   * them as ConflictException. Used primarily to rotate the push token or toggle `isActive`
   * without re-submitting all device metadata.
   *
   * @param userId - UUID of the owning user.
   * @param deviceId - ULID of the device to patch.
   * @param patchDeviceDto - Subset of device fields to update.
   * @returns The patched Device entity.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   * @throws {ConflictException} When the new token is already in use by another device.
   */
  async patchDevice(
    userId: string,
    deviceId: string,
    patchDeviceDto: PatchDeviceRequestDto,
  ): Promise<Device> {
    const ctx = { userId, deviceId };
    this.logger.log('Device patch started', { ...ctx, step: 'init' });

    const platform = this.mapPlatformToDevicePlatform(patchDeviceDto.platform);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      this.logger.warn('Device not found for patch', {
        ...ctx,
        step: 'existence_check',
      });
      throw new DeviceNotFoundException();
    }
    this.logger.debug('Device existence verified', {
      ...ctx,
      step: 'existence_check',
    });

    try {
      const patched = await this.prisma.device.update({
        where: { id: deviceId },
        data: {
          ...patchDeviceDto,
          platform,
        },
      });

      this.logger.debug('Device record patched', {
        ...ctx,
        step: 'persist_device',
      });

      this.logger.log('Device patched successfully', {
        ...ctx,
        step: 'complete',
      });
      return patched;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'P2002') {
        // Do NOT log the token itself (PII compliance)
        this.logger.warn('Device token conflict during patch', {
          ...ctx,
          step: 'duplicate_check',
        });
        throw new DeviceTokenAlreadyExistsException();
      }
      this.logger.error('Failed to patch device', {
        ...ctx,
        step: 'persist_device',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Permanently deletes a device record and emits a DEVICE_DELETED audit event.
   *
   * Ownership is verified before deletion. Stopping push notifications to the
   * removed token is a side effect of the record no longer existing — any FCM/APNs
   * messages targeted at the deleted token will fail silently at the provider level.
   *
   * @param userId - UUID of the owning user.
   * @param deviceId - ULID of the device to delete.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   */
  async deleteDevice(userId: string, deviceId: string): Promise<void> {
    const ctx = { userId, deviceId };
    this.logger.log('Device deletion started', { ...ctx, step: 'init' });

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      this.logger.warn('Device not found for deletion', {
        ...ctx,
        step: 'existence_check',
      });
      throw new DeviceNotFoundException();
    }
    this.logger.debug('Device existence verified', {
      ...ctx,
      step: 'existence_check',
    });

    try {
      await this.prisma.device.delete({
        where: { id: deviceId },
      });

      this.logger.debug('Device record deleted from database', {
        ...ctx,
        step: 'delete_device',
      });

      this.emitAuditLog({
        actionType: AuditActionType.DEVICE_DELETED,
        userId: userId,
        resourceId: deviceId,
      });

      this.logger.log('Device deleted successfully', {
        ...ctx,
        step: 'complete',
      });
    } catch (error) {
      this.logger.error('Failed to delete device', {
        ...ctx,
        step: 'delete_device',
        err: serializeError(error),
      });
      throw error;
    }
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
        this.logger.warn('Unknown platform, defaulting to ANDROID', {
          platform,
          step: 'map_platform',
        });
        return DevicePlatform.ANDROID;
    }
  }
}
