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
import { BaseController } from 'src/core/base/base.controller';
import { CurrentUserId } from 'src/common/decorators';
import { JwtAuthGuard } from 'src/common/guards';
import { SerializeExpose } from 'src/common/interceptors';
import { LoggerService } from 'src/core/logger/logger.service';
import { BlockService } from './blocks.service';
import { BlockResponseDto, CreateBlockDto } from './dto';

@ApiTags('Blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'blocks',
  version: ['1'],
})
export class BlockController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly blockService: BlockService,
  ) {
    super(logger);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a block' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BlockResponseDto })
  @SerializeExpose(BlockResponseDto)
  async create(@CurrentUserId() userId: string, @Body() dto: CreateBlockDto) {
    return this.blockService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get authenticated user active blocked users list' })
  @ApiResponse({ status: HttpStatus.OK, type: [BlockResponseDto] })
  @SerializeExpose(BlockResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.blockService.findAllForUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific block by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: BlockResponseDto })
  @SerializeExpose(BlockResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.blockService.findOneForUser(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user (Soft delete block)' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.blockService.delete(id, userId);
  }
}
