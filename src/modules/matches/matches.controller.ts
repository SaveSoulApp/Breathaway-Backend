import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
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
import {
  MatchListQueryDto,
  MatchResponseDto,
  PaginatedMatchResponseDto,
} from './dto';
import { MatchesService } from './matches.service';

@ApiTags('Matches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'matches',
  version: ['1'],
})
/**
 * Handles HTTP operations for the /matches resource.
 *
 * All endpoints are JWT-protected. Responses are normalised from the
 * authenticated user's perspective — "me" vs "otherUser" fields are
 * resolved at the service layer based on the caller's user ID.
 */
export class MatchesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly matchesService: MatchesService,
  ) {
    super(logger);
  }

  /**
   * Returns a paginated list of all ACTIVE matches for the authenticated user.
   *
   * Only matches where neither participant has been soft-deleted are returned.
   * Results are ordered by most-recently-matched first.
   *
   * @param query - Pagination parameters (`page`, `limit`; defaults: 1, 20).
   * @returns A paginated response containing match summaries with both users'
   *   basic profile info and the like label from the other user's swipe.
   */
  @Get()
  @ApiOperation({ summary: 'Get authenticated user active matches' })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedMatchResponseDto })
  @SerializeExpose(PaginatedMatchResponseDto)
  async findAll(
    @CurrentUserId() userId: string,
    @Query() query: MatchListQueryDto,
  ) {
    return this.matchesService.findAllForUser(userId, query);
  }

  /**
   * Retrieves a single match by its ID, verifying the authenticated user is a
   * participant before returning the record.
   *
   * @param id - UUID of the match to retrieve.
   * @returns The match detail DTO normalised to the caller's perspective.
   * @throws {NotFoundException} When no active match exists with the given ID
   *   for the authenticated user.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific match by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MatchResponseDto })
  @SerializeExpose(MatchResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.matchesService.findOneForUser(id, userId);
  }

  /**
   * Unmatches the authenticated user from the specified match, soft-deleting
   * the record and setting its status to UNMATCHED.
   *
   * @param id - UUID of the match to dissolve.
   * @throws {NotFoundException} When no active match exists with the given ID
   *   for the authenticated user.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unmatch from a user (Soft delete match)' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.matchesService.unmatch(id, userId);
  }
}
