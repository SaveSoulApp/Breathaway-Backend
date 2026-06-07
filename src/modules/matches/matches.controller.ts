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
import { CurrentUserId } from '@common/decorators';
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
@Controller({
  path: 'matches',
  version: ['1'],
})
export class MatchesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly matchesService: MatchesService,
  ) {
    super(logger);
  }

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

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific match by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MatchResponseDto })
  @SerializeExpose(MatchResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.matchesService.findOneForUser(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unmatch from a user (Soft delete match)' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.matchesService.unmatch(id, userId);
  }
}
