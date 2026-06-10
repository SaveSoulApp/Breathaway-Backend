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
  CreateDeviceDto,
  DeviceResponseDto,
  PatchDeviceDto,
  UpdateDeviceDto,
} from './dto';

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
  async registerDevice(
    @CurrentUserId() userId: string,
    @ClientIdentity(ClientIdentityKey.DEVICE_ID) deviceId: string,
    @ClientIdentity(ClientIdentityKey.USER_AGENT)
    userAgentData: interfaces.UserAgentData,
    @Body() createDeviceDto: CreateDeviceDto,
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
  async updateDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
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
  async patchDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
    @Body() patchDeviceDto: PatchDeviceDto,
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
  async deleteDevice(
    @CurrentUserId() userId: string,
    @Param('id') deviceId: string,
  ) {
    await this.devicesService.deleteDevice(userId, deviceId);
  }
}
