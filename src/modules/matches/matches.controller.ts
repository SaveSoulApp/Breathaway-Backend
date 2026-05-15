import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BaseController } from 'src/base/controller/base.controller';
import { CurrentUserId } from 'src/common/decorators';
import { JwtAuthGuard } from 'src/common/guards';
import { SerializeExpose } from 'src/common/interceptors';
import { LoggerService } from 'src/core/logger/logger.service';
import { MatchResponseDto } from './dto';
import { MatchService } from './matches.service';

@ApiTags('Matches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'matches',
  version: ['1'],
})
export class MatchController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly matchService: MatchService,
  ) {
    super(logger);
  }

  @Get()
  @ApiOperation({ summary: 'Get authenticated user active matches' })
  @ApiResponse({ status: HttpStatus.OK, type: [MatchResponseDto] })
  @SerializeExpose(MatchResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.matchService.findAllForUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific match by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MatchResponseDto })
  @SerializeExpose(MatchResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.matchService.findOneForUser(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unmatch from a user (Soft delete match)' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.matchService.unmatch(id, userId);
  }
}
