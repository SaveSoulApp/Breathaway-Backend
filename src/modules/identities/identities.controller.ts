import { CurrentUserId, ApiStandardErrors } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateIdentityDto,
  IdentityCompleteResponseDto,
  IdentityResponseDto,
  LookupIdentityRequestDto,
  UpdateIdentityDto,
} from './dto';
import { IdentitiesService } from './identities.service';

/**
 * Handles HTTP operations for the /identities resource.
 *
 * All endpoints require a valid JWT. Identities belong exclusively to the authenticated
 * user — no cross-user identity access is permitted here. Responses come in two flavours:
 * - **Masked** (`IdentityResponseDto`): safe for display; `publicValueMasked` is exposed
 *   but the plaintext is never returned.
 * - **Complete** (`IdentityCompleteResponseDto`): includes the decrypted `publicValue`
 *   and `platformId`; only served to the owning user on explicit /complete routes.
 */
@ApiTags('Identities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'identities',
  version: ['1'],
})
export class IdentitiesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly identitiesService: IdentitiesService,
  ) {
    super(logger);
  }

  /**
   * Registers a new identity for the authenticated user.
   *
   * If an unowned (userId = null) identity already exists with the same type and hash,
   * the service claims it for this user rather than creating a duplicate. The response
   * always returns the masked representation; call GET /:id/complete for the plaintext.
   *
   * @param dto - Identity type, raw public value, and optional platform ID.
   * @returns The created or claimed identity in masked form.
   * @throws {ConflictException} When an active identity with the same type and value
   *   already belongs to another user.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new identity' })
  @ApiResponse({ status: HttpStatus.CREATED, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateIdentityDto,
  ) {
    return this.identitiesService.create(userId, dto);
  }

  /**
   * Returns all non-deleted identities owned by the authenticated user, in masked form.
   *
   * Sorted by `createdAt` descending. Plaintext values are never included —
   * use GET /complete or GET /:id/complete to retrieve decrypted data.
   *
   * @returns Array of masked identity records.
   */
  @Get()
  @ApiOperation({ summary: 'Get all identities for the current user' })
  @ApiResponse({ status: HttpStatus.OK, type: [IdentityResponseDto] })
  @SerializeExpose(IdentityResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.identitiesService.findAllByUser(userId);
  }

  /**
   * Returns all non-deleted identities for the user with plaintext `publicValue`
   * and `platformId` decrypted and included in the response.
   *
   * This endpoint performs one decryption call per identity — avoid calling it
   * in polling loops or with users that have a large number of identities.
   *
   * @returns Array of complete identity records with decrypted values.
   */
  @Get('complete')
  @ApiOperation({
    summary:
      'Get all complete identities for the current user (includes unmasked values)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [IdentityCompleteResponseDto] })
  @SerializeExpose(IdentityCompleteResponseDto)
  async findAllComplete(@CurrentUserId() userId: string) {
    return this.identitiesService.findAllCompleteByUser(userId);
  }

  /**
   * Resolves an identity by its raw (plaintext) public value, scoped to the current user.
   *
   * Hashes the incoming `publicValue` to look up the record, then decrypts it before
   * returning — the plaintext is never stored in the DB. Useful for flows where the
   * client knows the value (e.g. from a contacts scan) but not the internal identity ID.
   *
   * @param dto - Identity type and raw public value to search for.
   * @returns The matching complete identity (with decrypted values) if found.
   * @throws {NotFoundException} When no identity with the given type + value exists for this user.
   */
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Look up an identity by its raw public value (scoped to current user)',
    description:
      'Returns the full identity details including decrypted public value and platform ID. ' +
      'Returns 404 if no matching identity is registered under this user.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityCompleteResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No identity with the provided value found for this user',
  })
  @SerializeExpose(IdentityCompleteResponseDto)
  async lookup(
    @CurrentUserId() userId: string,
    @Body() dto: LookupIdentityRequestDto,
  ) {
    return this.identitiesService.findByPublicValue(userId, dto);
  }

  /**
   * Retrieves a single identity by ID in masked form, enforcing ownership.
   *
   * @param id - UUID of the identity to retrieve.
   * @returns The masked identity record.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific identity by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identitiesService.findOne(id, userId);
  }

  /**
   * Retrieves a single identity with decrypted `publicValue` and `platformId`, enforcing ownership.
   *
   * Performs live decryption via the crypto service on each call — values are not cached.
   *
   * @param id - UUID of the identity to retrieve.
   * @returns The complete identity record with plaintext values.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  @Get(':id/complete')
  @ApiOperation({
    summary:
      'Get a specific complete identity by ID (includes unmasked values)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityCompleteResponseDto })
  @SerializeExpose(IdentityCompleteResponseDto)
  async findOneComplete(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.identitiesService.findOneComplete(id, userId);
  }

  /**
   * Updates the `publicValue` and/or `platformId` of an existing identity.
   *
   * If neither field is provided the existing record is returned unchanged. Duplicate
   * detection runs against all other active identities of the same type before persisting.
   * Updating `publicValue` resets the verification state — `isVerified` becomes `false`
   * and `verifiedAt` is cleared by the service layer.
   *
   * @param id  - UUID of the identity to update.
   * @param dto - New `publicValue` and/or `platformId`; both are optional.
   * @returns The updated identity in masked form.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   * @throws {ConflictException} When another active identity of the same type already holds
   *   the supplied value or platform ID.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a specific identity' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIdentityDto,
  ) {
    return this.identitiesService.update(id, userId, dto);
  }

  /**
   * Soft-deletes an identity by stamping `deletedAt` and disassociating it from the user
   * (`userId` set to null), making it reclaimable by another account in the future.
   *
   * @param id - UUID of the identity to delete.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a specific identity' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.identitiesService.delete(id, userId);
  }

  /**
   * Marks an identity as verified, recording the verification timestamp.
   *
   * In production, verification should be triggered by an out-of-band confirmation flow
   * (e.g. SMS OTP, OAuth token exchange) rather than a direct HTTP call to this endpoint.
   * Emits an `IDENTITY_VERIFIED` audit log event on success.
   *
   * @param id - UUID of the identity to verify.
   * @returns The updated identity in masked form with `isVerified: true`.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a specific identity' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async verify(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identitiesService.verify(id, userId);
  }
}
