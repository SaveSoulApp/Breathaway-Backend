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
import { BaseController } from '@core/base';
import { CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';
import {
  CreateProfileDto,
  PatchProfileDto,
  ProfileResponseDto,
  UpdateProfileDto,
} from './dto';
import { ProfilesService } from './profiles.service';

@ApiTags('Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'profiles',
  version: ['1'],
})
export class ProfilesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly profilesService: ProfilesService,
  ) {
    super(logger);
  }

  @Post()
  @ApiOperation({ summary: 'Create user profile' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Profile created successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Profile already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async createProfile(
    @CurrentUserId() userId: string,
    @Body() createProfileDto: CreateProfileDto,
  ) {
    const profile = await this.profilesService.createProfile(
      userId,
      createProfileDto,
    );
    return profile;
  }

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile retrieved successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Profile not found',
  })
  async getMyProfile(@CurrentUserId() userId: string) {
    const profile = await this.profilesService.getProfileByUserId(userId);
    return profile;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get profile by ID' })
  @ApiParam({ name: 'id', description: 'Profile ID (ULID)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile retrieved successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Profile not found',
  })
  async getProfileById(@Param('id') id: string) {
    const profile = await this.profilesService.getProfileById(id);
    return profile;
  }

  @Put()
  @ApiOperation({ summary: 'Update profile (full replacement)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile updated successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Profile not found',
  })
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const profile = await this.profilesService.updateProfile(
      userId,
      updateProfileDto,
    );
    return profile;
  }

  @Patch()
  @ApiOperation({ summary: 'Patch profile (partial update)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile patched successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Profile not found',
  })
  async patchProfile(
    @CurrentUserId() userId: string,
    @Body() patchProfileDto: PatchProfileDto,
  ) {
    const profile = await this.profilesService.patchProfile(
      userId,
      patchProfileDto,
    );
    return profile;
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete profile' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Profile deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Profile not found',
  })
  async deleteProfile(@CurrentUserId() userId: string) {
    await this.profilesService.deleteProfile(userId);
  }
}
