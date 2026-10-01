import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiStandardErrors } from '@common/decorators';
import { BasicAuthGuard } from '@common/guards/basic-auth.guard';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { RefreshInstagramTokenRequestDto } from './dto';
import { InstagramService } from './instagram.service';

@ApiTags('Instagram')
@ApiStandardErrors()
@Controller({
  path: 'instagram',
  version: ['1'],
})
@UseGuards(BasicAuthGuard)
/**
 * Handles HTTP operations for Instagram access-token management under /instagram.
 *
 * All endpoints are restricted to internal callers via BasicAuthGuard — these routes
 * are not intended for end-user consumption.
 */
export class InstagramController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly instagramService: InstagramService,
  ) {
    super(logger);
  }

  /**
   * Refreshes a caller-supplied Instagram user access token via the Graph API
   * and persists the new token to GCP Secret Manager.
   *
   * @param query - The request query parameters containing the active token.
   * @returns The Graph API refresh response including the new access token and its expiry.
   * @throws {InstagramGraphApiException} When the Graph API rejects the token (e.g., token is invalid
   *   or already expired beyond refresh eligibility).
   */
  @Get('refresh-token')
  @ApiOperation({ summary: 'Refresh Instagram user access token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User access token refreshed successfully',
  })
  async refresh(
    @Query() query: RefreshInstagramTokenRequestDto,
  ): Promise<unknown> {
    return this.instagramService.refreshAccessToken(query.token);
  }

  /**
   * Refreshes the system-level Instagram access token sourced from environment
   * configuration and persists the updated token to GCP Secret Manager.
   *
   * Unlike `refresh`, this endpoint reads the token from `INSTAGRAM_ACCESS_TOKEN`
   * config — no caller-supplied value is required. Use this for scheduled
   * token-rotation tasks.
   *
   * @returns The Graph API refresh response including the new token and expiry.
   * @throws {MissingInstagramConfigException} When `INSTAGRAM_ACCESS_TOKEN` is absent
   *   from the environment configuration.
   * @throws {InstagramGraphApiException} When the Graph API rejects the stored token.
   */
  @Get('refresh-env-token')
  @ApiOperation({ summary: 'Refresh Instagram system access token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'System access token refreshed successfully',
  })
  async refreshEnvToken(): Promise<unknown> {
    return this.instagramService.refreshSystemAccessToken();
  }
}
