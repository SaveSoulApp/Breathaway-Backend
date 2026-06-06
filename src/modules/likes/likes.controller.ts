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
import {
  CreateLikeRequestDto,
  LikeListResponseDto,
  LikeResponseDto,
} from './dto';
import { LikesService } from './likes.service';

@ApiTags('Likes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a like' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LikeResponseDto })
  @SerializeExpose(LikeResponseDto)
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateLikeRequestDto,
  ) {
    return this.likesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get authenticated user pending likes' })
  @ApiResponse({ status: HttpStatus.OK, type: LikeListResponseDto })
  @SerializeExpose(LikeListResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.likesService.findAllForUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific like by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: LikeResponseDto })
  @SerializeExpose(LikeResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.likesService.findOneForUser(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a pending like' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.likesService.delete(id, userId);
  }
}
