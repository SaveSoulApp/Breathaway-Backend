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
import { CurrentUserId, ApiStandardErrors } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';
import {
  CreateProfileDto,
  PatchProfileDto,
  ProfileResponseDto,
  UpdateProfileDto,
} from './dto';
import { ProfilesService } from './profiles.service';

/**
 * Handles HTTP operations for the /profiles resource.
 *
 * All endpoints require a valid JWT — the authenticated user's ID is resolved
 * from the token via the `@CurrentUserId()` decorator and cannot be overridden
 * by the caller. Write operations (POST, PUT, PATCH, DELETE) are scoped
 * exclusively to the authenticated user's own profile.
 */
@ApiTags('Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
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
  /**
   * Creates a profile for the authenticated user.
   *
   * Each user may have at most one profile — submitting a second creation
   * request while a profile already exists returns a 409 Conflict.
   *
   * @returns The newly created `ProfileResponseDto`.
   * @throws {ConflictException} When a profile already exists for the authenticated user.
   * @throws {BadRequestException} When the request body fails validation.
   */
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
  /**
   * Returns the profile belonging to the authenticated user.
   *
   * @returns The authenticated user's `ProfileResponseDto`.
   * @throws {NotFoundException} When the authenticated user has no profile yet.
   */
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
  /**
   * Returns a profile by its ULID, regardless of which user owns it.
   *
   * Intended for scenarios where the caller knows a profile ID directly
   * (e.g., social graph lookups). Authentication is still required, but
   * the returned profile may belong to a different user.
   *
   * @param id - ULID of the profile to retrieve.
   * @returns The matching `ProfileResponseDto`.
   * @throws {NotFoundException} When no profile exists with the given ID.
   */
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
  /**
   * Fully replaces the authenticated user's profile (PUT semantics).
   *
   * All fields in the request body overwrite existing values — omitting an
   * optional field resets it to its default, not its current persisted value.
   *
   * @returns The fully updated `ProfileResponseDto`.
   * @throws {NotFoundException} When the authenticated user has no profile yet.
   */
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
  /**
   * Partially updates the authenticated user's profile (PATCH semantics).
   *
   * Only the supplied fields are overwritten; absent fields retain their
   * current persisted values.
   *
   * @returns The patched `ProfileResponseDto`.
   * @throws {NotFoundException} When the authenticated user has no profile yet.
   */
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
  /**
   * Soft-deletes the authenticated user's account and all associated data.
   *
   * This is a non-reversible, cascading operation — identities, auth
   * credentials, and devices are also deactivated in the same transaction.
   * Returns 204 No Content on success.
   *
   * @throws {NotFoundException} When the authenticated user does not exist or
   *   has already been deleted.
   */
  async deleteProfile(@CurrentUserId() userId: string) {
    await this.profilesService.deleteProfile(userId);
  }
}
