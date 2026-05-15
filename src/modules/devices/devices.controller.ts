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
import { BaseController } from 'src/base/controller/base.controller';
import {
  AppVersion,
  CurrentUserId,
  DeviceId,
  DevicePlatform,
} from 'src/common/decorators';
import { JwtAuthGuard } from 'src/common/guards';
import { Platform } from 'src/common/interfaces';
import { LoggerService } from 'src/core/logger/logger.service';
import { DeviceService } from './devices.service';
import {
  CreateDeviceDto,
  DeviceResponseDto,
  PatchDeviceDto,
  UpdateDeviceDto,
} from './dto';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'devices',
  version: ['1'],
})
export class DeviceController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly deviceService: DeviceService,
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
  async registerDevice(
    @CurrentUserId() userId: string,
    @DeviceId() deviceId: string | undefined,
    @AppVersion() appVersion: string | undefined,
    @DevicePlatform() platform: string | undefined,
    @Body() createDeviceDto: CreateDeviceDto,
  ) {
    // Override/app device metadata from headers if provided
    if (deviceId) createDeviceDto.deviceId = deviceId;
    if (appVersion) createDeviceDto.appVersion = appVersion;
    if (platform) createDeviceDto.platform = platform as Platform;

    return this.deviceService.createDevice(userId, createDeviceDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all devices for the current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of devices',
    type: [DeviceResponseDto],
  })
  async getUserDevices(@CurrentUserId() userId: string) {
    return this.deviceService.getUserDevices(userId);
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
  async getDeviceById(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
  ) {
    return this.deviceService.getDeviceById(userId, deviceId);
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
  async updateDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
  ) {
    return this.deviceService.updateDevice(userId, deviceId, updateDeviceDto);
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
  async patchDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
    @Body() patchDeviceDto: PatchDeviceDto,
  ) {
    return this.deviceService.patchDevice(userId, deviceId, patchDeviceDto);
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
  async deleteDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
  ) {
    await this.deviceService.deleteDevice(userId, deviceId);
  }
}
