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
import { CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { LoggerService } from '@core/logger';
import { BlocksService } from './blocks.service';
import { BlockResponseDto, CreateBlockDto } from './dto';

@ApiTags('Blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a block' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BlockResponseDto })
  @SerializeExpose(BlockResponseDto)
  async create(@CurrentUserId() userId: string, @Body() dto: CreateBlockDto) {
    return this.blocksService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get authenticated user active blocked users list' })
  @ApiResponse({ status: HttpStatus.OK, type: [BlockResponseDto] })
  @SerializeExpose(BlockResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.blocksService.findAllForUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific block by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: BlockResponseDto })
  @SerializeExpose(BlockResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.blocksService.findOneForUser(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user (Soft delete block)' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.blocksService.delete(id, userId);
  }
}
