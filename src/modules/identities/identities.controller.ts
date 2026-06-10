import { CurrentUserId, ApiStandardErrors } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateIdentityDto,
  IdentityCompleteResponseDto,
  IdentityResponseDto,
  LookupIdentityRequestDto,
  UpdateIdentityDto,
} from './dto';
import { IdentitiesService } from './identities.service';

@ApiTags('Identities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'identities',
  version: ['1'],
})
export class IdentitiesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly identitiesService: IdentitiesService,
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
    return this.identitiesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all identities for the current user' })
  @ApiResponse({ status: HttpStatus.OK, type: [IdentityResponseDto] })
  @SerializeExpose(IdentityResponseDto)
  async findAll(@CurrentUserId() userId: string) {
    return this.identitiesService.findAllByUser(userId);
  }

  @Get('complete')
  @ApiOperation({
    summary:
      'Get all complete identities for the current user (includes unmasked values)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [IdentityCompleteResponseDto] })
  @SerializeExpose(IdentityCompleteResponseDto)
  async findAllComplete(@CurrentUserId() userId: string) {
    return this.identitiesService.findAllCompleteByUser(userId);
  }

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Look up an identity by its raw public value (scoped to current user)',
    description:
      'Returns the full identity details including decrypted public value and platform ID. ' +
      'Returns 404 if no matching identity is registered under this user.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityCompleteResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No identity with the provided value found for this user',
  })
  @SerializeExpose(IdentityCompleteResponseDto)
  async lookup(
    @CurrentUserId() userId: string,
    @Body() dto: LookupIdentityRequestDto,
  ) {
    return this.identitiesService.findByPublicValue(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific identity by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identitiesService.findOne(id, userId);
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
    return this.identitiesService.findOneComplete(id, userId);
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
    return this.identitiesService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a specific identity' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.identitiesService.delete(id, userId);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a specific identity' })
  @ApiResponse({ status: HttpStatus.OK, type: IdentityResponseDto })
  @SerializeExpose(IdentityResponseDto)
  async verify(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.identitiesService.verify(id, userId);
  }
}
