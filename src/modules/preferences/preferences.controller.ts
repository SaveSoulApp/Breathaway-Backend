import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  ConsentLedgerQueryRequestDto,
  PaginatedConsentLedgerResponseDto,
  PreferencesResponseDto,
  UpdatePreferencesRequestDto,
} from './dto';
import { PreferencesService } from './preferences.service';

/**
 * Handles HTTP operations for the /preferences resource.
 *
 * All endpoints require a valid JWT. Users can retrieve and selectively
 * update their notification channel toggles without affecting unspecified settings.
 */
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

  /**
   * Retrieves the authenticated user's current notification preferences.
   *
   * Returns system defaults (all channels enabled) if the user's preference
   * record has not yet been explicitly created.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @returns The user's notification preference state across all four channels.
   */
  @Get()
  @ApiOperation({ summary: 'Get current notification preferences' })
  @ApiResponse({ type: PreferencesResponseDto })
  @SerializeExpose(PreferencesResponseDto)
  async getPreferences(
    @CurrentUserId() userId: string,
  ): Promise<PreferencesResponseDto> {
    return this.preferencesService.getPreferences(userId);
  }

  /**
   * Retrieves the authenticated user's consent ledger history across all notification channels.
   *
   * Fulfills GDPR Article 7 auditability by returning an immutable, timestamped chronological log
   * of consent state changes for the requesting user with standard pagination.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @param query - Pagination parameters and optional channel filter.
   * @returns Paginated list of consent log entries ordered newest first with navigation metadata.
   */
  @Get('consents')
  @ApiOperation({
    summary: 'Get paginated consent ledger history for the authenticated user',
  })
  @ApiResponse({ type: PaginatedConsentLedgerResponseDto })
  @SerializeExpose(PaginatedConsentLedgerResponseDto)
  async getConsentHistory(
    @CurrentUserId() userId: string,
    @Query() query: ConsentLedgerQueryRequestDto,
  ): Promise<PaginatedConsentLedgerResponseDto> {
    return this.preferencesService.getConsentHistory(userId, query);
  }

  /**
   * Partially updates the authenticated user's notification preferences.
   *
   * Only fields provided in the request body are changed; omitted fields
   * retain their current values. Creates the preference record if it does not exist.
   *
   * @param userId - UUID of the authenticated user, extracted from the JWT.
   * @param dto - Partial set of notification channel toggles to apply.
   * @returns The full updated notification preference state after the change.
   */
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
