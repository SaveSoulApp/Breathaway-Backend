import { CurrentUserId, ApiStandardErrors } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PreferencesResponseDto, UpdatePreferencesRequestDto } from './dto';
import { PreferencesService } from './preferences.service';

@ApiTags('Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'preferences',
  version: ['1'],
})
export class PreferencesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly preferencesService: PreferencesService,
  ) {
    super(logger);
  }

  @Get()
  @ApiOperation({ summary: 'Get current notification preferences' })
  @ApiResponse({ type: PreferencesResponseDto })
  @SerializeExpose(PreferencesResponseDto)
  async getPreferences(
    @CurrentUserId() userId: string,
  ): Promise<PreferencesResponseDto> {
    return this.preferencesService.getPreferences(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ type: PreferencesResponseDto })
  @SerializeExpose(PreferencesResponseDto)
  async updatePreferences(
    @CurrentUserId() userId: string,
    @Body() dto: UpdatePreferencesRequestDto,
  ): Promise<PreferencesResponseDto> {
    return this.preferencesService.updatePreferences(userId, dto);
  }
}
