import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BaseController } from '@core/base';
import { CurrentUserId, ApiStandardErrors } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { LoggerService } from '@core/logger';
import { BlocksService } from './blocks.service';
import { BlockResponseDto, CreateBlockDto } from './dto';

/**
 * HTTP resource for the `/blocks` domain, managing user-to-user block relationships.
 * All endpoints require a valid JWT; the caller's `userId` is always sourced from the
 * token, never the request body, ensuring users can only manage their own blocks.
 */
@ApiTags('Blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'blocks',
  version: ['1'],
})
export class BlocksController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly blocksService: BlocksService,
  ) {
    super(logger);
  }

  /**
   * Blocks the user specified in `dto` on behalf of the authenticated caller.
   * Re-blocking a previously unblocked user is permitted.
   *
   * @param dto - Payload identifying the target user to block.
   * @returns The newly created block record.
   * @throws `ConflictException` if an active block already exists between the two users.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a block' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BlockResponseDto })
  @SerializeExpose(BlockResponseDto)
  async create(@CurrentUserId() userId: string, @Body() dto: CreateBlockDto) {
    return this.blocksService.create(userId, dto);
  }

  /**
   * Returns the full list of users the authenticated caller has currently blocked.
   * Soft-deleted (unblocked) entries are excluded from the result set.
   *
   * @returns An array of active block records belonging to the caller.
   */
  @Get()
  @ApiOperation({ summary: 'Get authenticated user active blocked users list' })
  @ApiResponse({ status: HttpStatus.OK, type: [BlockResponseDto] })
  @SerializeExpose(BlockResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.blocksService.findAllForUser(userId);
  }

  /**
   * Retrieves a single block record by its ID, scoped to the authenticated caller
   * to prevent one user from reading another user's block data.
   *
   * @param id - UUID of the block record to retrieve.
   * @returns The matching block record.
   * @throws `NotFoundException` if no block with the given `id` exists for the caller.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific block by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: BlockResponseDto })
  @SerializeExpose(BlockResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.blocksService.findOneForUser(id, userId);
  }

  /**
   * Unblocks a user via soft delete; the block record is retained for audit purposes
   * and the same user may be re-blocked at a later time.
   *
   * @param id - UUID of the block record to soft-delete.
   * @throws `NotFoundException` if no active block with the given `id` exists for the caller.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user (Soft delete block)' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.blocksService.delete(id, userId);
  }
}
