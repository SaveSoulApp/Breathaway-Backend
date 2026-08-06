import { CurrentUserId, ApiStandardErrors } from '@common/decorators';
import { ClientIdentity } from '@common/decorators/client-identity.decorator';
import { ClientIdentityKey } from '@common/enums';
import { JwtAuthGuard } from '@common/guards';
import * as interfaces from '@common/interfaces';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import {
  CreateDeviceRequestDto,
  DeviceResponseDto,
  PatchDeviceRequestDto,
  UpdateDeviceRequestDto,
} from './dto';

/**
 * Handles HTTP operations for the /devices resource.
 *
 * All endpoints require a valid JWT. Device ownership is enforced at the service layer
 * — routes that operate on a specific device reject requests when the device does not
 * belong to the authenticated user.
 */
@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'devices',
  version: ['1'],
})
export class DevicesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly devicesService: DevicesService,
  ) {
    super(logger);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new device' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Device registered successfully',
    type: DeviceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Device token already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  /**
   * Registers a new push notification device for the authenticated user.
   *
   * Device metadata (deviceId, appVersion, platform) can be supplied via request body
   * or overridden by custom client identity headers extracted by the `@ClientIdentity`
   * decorator — headers take precedence over body values when present.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @param deviceId - Physical device identifier extracted from the request header, if provided.
   * @param userAgentData - Parsed x-user-agent metadata (version, platform) from the request header.
   * @param createDeviceDto - Push token and optional device metadata.
   * @returns The persisted device record including its generated ID.
   * @throws {ConflictException} When a device with the same push token is already registered.
   */
  async registerDevice(
    @CurrentUserId() userId: string,
    @ClientIdentity(ClientIdentityKey.DEVICE_ID) deviceId: string,
    @ClientIdentity(ClientIdentityKey.USER_AGENT)
    userAgentData: interfaces.UserAgentData,
    @Body() createDeviceDto: CreateDeviceRequestDto,
  ) {
    // Override/app device metadata from headers if provided
    if (deviceId) createDeviceDto.deviceId = deviceId;
    if (userAgentData.version)
      createDeviceDto.appVersion = userAgentData.version;
    if (userAgentData.platform)
      createDeviceDto.platform = userAgentData.platform;

    return this.devicesService.createDevice(userId, createDeviceDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all devices for the current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of devices',
    type: [DeviceResponseDto],
  })
  /**
   * Returns all devices registered by the authenticated user, ordered by registration date descending.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @returns An array of device records belonging to the user; empty array if none are registered.
   */
  async getUserDevices(@CurrentUserId() userId: string) {
    return this.devicesService.getUserDevices(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device by ID' })
  @ApiParam({ name: 'id', description: 'Device record ID (ULID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Device retrieved successfully',
    type: DeviceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Device not found',
  })
  /**
   * Retrieves a single device record, scoped to the authenticated user.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @param deviceId - ULID of the device record to retrieve.
   * @returns The matching device record.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   */
  async getDeviceById(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
  ) {
    return this.devicesService.getDeviceById(userId, deviceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update device (full replacement)' })
  @ApiParam({ name: 'id', description: 'Device record ID (ULID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Device updated successfully',
    type: DeviceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Device not found',
  })
  /**
   * Fully replaces a device record's fields with the provided payload.
   *
   * Use this when the push token has been rotated and all device metadata
   * should be re-submitted. For partial changes, prefer PATCH.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @param deviceId - ULID of the device record to update.
   * @param updateDeviceDto - Complete replacement payload for the device.
   * @returns The updated device record.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   * @throws {ConflictException} When the new token is already registered to another device.
   */
  async updateDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
    @Body() updateDeviceDto: UpdateDeviceRequestDto,
  ) {
    return this.devicesService.updateDevice(userId, deviceId, updateDeviceDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Patch device (partial update)' })
  @ApiParam({ name: 'id', description: 'Device record ID (ULID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Device patched successfully',
    type: DeviceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Device not found',
  })
  /**
   * Partially updates a device record, applying only the provided fields.
   *
   * Unspecified fields retain their existing values. Commonly used to update
   * the push token or toggle the `isActive` flag without re-submitting all device metadata.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @param deviceId - ULID of the device record to patch.
   * @param patchDeviceDto - Subset of device fields to update.
   * @returns The patched device record.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   * @throws {ConflictException} When the new token is already registered to another device.
   */
  async patchDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
    @Body() patchDeviceDto: PatchDeviceRequestDto,
  ) {
    return this.devicesService.patchDevice(userId, deviceId, patchDeviceDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a device' })
  @ApiParam({ name: 'id', description: 'Device record ID (ULID)' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Device deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Device not found',
  })
  /**
   * Permanently removes a device record, stopping push notifications to that token.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @param deviceId - ULID of the device record to delete.
   * @throws {NotFoundException} When no device with the given ID exists for this user.
   */
  async deleteDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
  ) {
    await this.devicesService.deleteDevice(userId, deviceId);
  }
}
