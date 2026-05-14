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
import { BaseController } from 'src/base/controller/base.controller';
import { CurrentUserId } from 'src/common/decorators';
import { JwtAuthGuard } from 'src/common/guards';
import { SerializeExpose } from 'src/common/interceptors';
import { LoggerService } from 'src/core/logger/logger.service';
import {
  CreateIdentityDto,
  IdentityCompleteResponseDto,
  IdentityResponseDto,
  UpdateIdentityDto,
} from './dto';
import { IdentityService } from './identity.service';

@UseGuards(JwtAuthGuard)
@Controller({
  path: 'identity',
  version: ['1'],
})
export class IdentityController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly identityService: IdentityService,
  ) {
    super(logger);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @SerializeExpose(IdentityResponseDto)
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateIdentityDto,
  ) {
    return this.identityService.create(userId, dto);
  }

  @Get()
  @SerializeExpose(IdentityResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.identityService.findAllByUser(userId);
  }

  @Get(':id')
  @SerializeExpose(IdentityResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identityService.findOne(id, userId);
  }

  @Get(':id/complete')
  @SerializeExpose(IdentityCompleteResponseDto)
  async findOneComplete(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.identityService.findOneComplete(id, userId);
  }

  @Patch(':id')
  @SerializeExpose(IdentityResponseDto)
  async update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIdentityDto,
  ) {
    return this.identityService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.identityService.delete(id, userId);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @SerializeExpose(IdentityResponseDto)
  async verify(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identityService.verify(id, userId);
  }
}
