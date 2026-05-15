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
import { BaseController } from 'src/core/base/base.controller';
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
import { IdentityService } from './identities.service';

@ApiTags('Identities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'identities',
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
  @ApiOperation({ summary: 'Create a new identity' })
  @ApiResponse({ status: HttpStatus.CREATED, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateIdentityDto,
  ) {
    return this.identityService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all identities for the current user' })
  @ApiResponse({ status: HttpStatus.OK, type: [IdentityResponseDto] })
  @SerializeExpose(IdentityResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.identityService.findAllByUser(userId);
  }

  @Get('complete')
  @ApiOperation({
    summary:
      'Get all complete identities for the current user (includes unmasked values)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [IdentityCompleteResponseDto] })
  @SerializeExpose(IdentityCompleteResponseDto)
  async findAllComplete(@CurrentUserId() userId: string) {
    return this.identityService.findAllCompleteByUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific identity by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identityService.findOne(id, userId);
  }

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
    return this.identityService.findOneComplete(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a specific identity' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
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
  @ApiOperation({ summary: 'Delete a specific identity' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.identityService.delete(id, userId);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a specific identity' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async verify(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identityService.verify(id, userId);
  }
}
