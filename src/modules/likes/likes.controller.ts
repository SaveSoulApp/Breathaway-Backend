import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard, RequireTimezoneGuard } from '@common/guards';
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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import {
  CreateLikeRequestDto,
  LikeListQueryDto,
  LikeResponseDto,
  PaginatedLikeResponseDto,
  UpdateLikeLabelRequestDto,
  CanCreateLikeResponseDto,
} from './dto';
import { LikesService } from './likes.service';

/**
 * Handles HTTP operations for the /likes resource.
 *
 * All endpoints are protected by JWT authentication; the acting user is derived
 * from the JWT payload via @CurrentUserId and can only access or mutate their
 * own likes — no cross-user operations are permitted at this layer.
 */
@ApiTags('Likes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'likes',
  version: ['1'],
})
export class LikesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly likesService: LikesService,
  ) {
    super(logger);
  }

  /**
   * Checks if a like can be successfully created.
   *
   * Evaluates if the target identity is valid and if the user is not trying to
   * duplicate an existing like or like a user they are already matched with.
   *
   * @param dto - Target identity reference.
   * @returns An object indicating if creation is possible.
   * @throws {ConflictException} If a like or active match already exists.
   */
  @Post('can-create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if a like can be created' })
  @ApiResponse({ status: HttpStatus.OK, type: CanCreateLikeResponseDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A like or active match already exists for this identity',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot like yourself or invalid identity data',
  })
  @SerializeExpose(CanCreateLikeResponseDto)
  async canCreate(
    @CurrentUserId() userId: string,
    @Body() dto: CreateLikeRequestDto,
  ) {
    return this.likesService.canCreate(userId, dto);
  }

  /**
   * Records the authenticated user's like for a target identity.
   *
   * If the caller provides a raw `targetIdentity` instead of a `targetIdentityId`,
   * the service will resolve or create the identity transparently. Match resolution
   * runs asynchronously after the response is returned — it does not block this call.
   *
   * @param dto - Target identity reference and optional intent/label for the like.
   * @returns The newly created like, including the decrypted target identity.
   * @throws {BadRequestException} When neither `targetIdentityId` nor `targetIdentity` is provided,
   *   or when the user attempts to like themselves.
   * @throws {NotFoundException} When the referenced target identity does not exist.
   * @throws {ConflictException} When an active like for the same target identity already exists.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a like' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LikeResponseDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Already liked or active match exists for this identity',
  })
  @SerializeExpose(LikeResponseDto)
  @UseGuards(RequireTimezoneGuard)
  async create(
    @Req() req: Request,
    @CurrentUserId() userId: string,
    @Body() dto: CreateLikeRequestDto,
  ) {
    const timezone = req.timezone;
    return this.likesService.create(userId, dto, timezone);
  }

  /**
   * Returns a paginated list of likes sent by the authenticated user.
   *
   * Results can be filtered by `intent` and `status` and are sorted by `createdAt`
   * descending by default. Each like includes the decrypted target identity `publicValue`.
   *
   * @param query - Pagination, filter, and sort options.
   * @returns A paginated envelope with likes and cursor metadata.
   */
  @Get()
  @ApiOperation({ summary: 'Get authenticated user pending likes' })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedLikeResponseDto })
  @SerializeExpose(PaginatedLikeResponseDto)
  async findAll(
    @CurrentUserId() userId: string,
    @Query() query: LikeListQueryDto,
  ) {
    return this.likesService.findAllForUser(userId, query);
  }

  /**
   * Retrieves a single like by its ID, scoped to the authenticated user.
   *
   * @param id - UUID of the like to retrieve.
   * @returns The matching like with decrypted target identity data.
   * @throws {NotFoundException} When no like with the given ID exists for the current user.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific like by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: LikeResponseDto })
  @SerializeExpose(LikeResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.likesService.findOneForUser(id, userId);
  }

  /**
   * Adds or replaces the personal label on one of the user's likes.
   *
   * Label updates are permitted regardless of the like's current status (PENDING,
   * MATCHED, VOIDED), so users can always annotate their history. Sending `null`
   * clears an existing label.
   *
   * @param id  - UUID of the like to update.
   * @param dto - New label value; `null` removes the label.
   * @returns The updated like with the new label applied.
   * @throws {NotFoundException} When no like with the given ID exists for the current user.
   */
  @Patch(':id/label')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add or update the personal label on a like' })
  @ApiResponse({ status: HttpStatus.OK, type: LikeResponseDto })
  @SerializeExpose(LikeResponseDto)
  async updateLabel(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLikeLabelRequestDto,
  ) {
    return this.likesService.updateLabel(id, userId, dto);
  }

  /**
   * Soft-deletes a like by setting its status to DELETED and stamping `deletedAt`.
   *
   * Only PENDING likes can be removed; attempting to delete a MATCHED or VOIDED
   * like will be rejected. The like record is preserved for audit purposes.
   *
   * @param id - UUID of the like to delete.
   * @throws {NotFoundException} When no like with the given ID exists for the current user.
   * @throws {BadRequestException} When the like is not in PENDING status.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a pending like' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.likesService.delete(id, userId);
  }
}
