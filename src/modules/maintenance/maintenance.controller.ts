import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { GcpOidcAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';

@ApiTags('Internal Jobs')
@SkipClientIdentity()
@ApiBearerAuth()
@UseGuards(GcpOidcAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'internal/jobs',
  version: ['1'],
})
/**
 * Internal HTTP controller that exposes GCP Cloud Scheduler job endpoints for
 * scheduled data-hygiene operations.
 *
 * All routes are protected by `GcpOidcAuthGuard`, which validates the OIDC
 * token issued by Cloud Scheduler — no user JWT is involved. The
 * `@SkipClientIdentity()` decorator bypasses the standard client-identity
 * middleware, since requests originate from Google infrastructure, not app
 * clients. Excluded from public-facing Swagger documentation.
 */
export class MaintenanceController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly maintenanceService: MaintenanceService,
  ) {
    super(logger);
  }

  /**
   * Triggers the credit-bundle expiration job, voiding all unused bundles
   * that have passed their expiry date.
   *
   * Intended to be called daily by GCP Cloud Scheduler. Delegates entirely
   * to `CreditsService.expireCreditBundles` — see that method for the
   * expiration criteria and return shape.
   *
   * @returns A summary of how many bundles were expired.
   */
  @Post('expire-bundles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run expiration job for unused credit bundles' })
  @ApiResponse({ status: HttpStatus.OK })
  async expireCreditBundles() {
    return this.maintenanceService.expireCreditBundles();
  }

  /**
   * Triggers the like-expiration job, voiding all PENDING likes older than
   * 90 days to prevent stale swipes from matching after a long dormancy.
   *
   * Intended to be called periodically (e.g., nightly) by GCP Cloud Scheduler.
   * Voided likes are not deleted — the status change preserves audit history
   * while making them ineligible for match resolution.
   *
   * @returns `{ voidedCount: number }` — the number of likes transitioned to VOIDED.
   */
  @Post('expire-likes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run job to void pending likes exceeding 90-day TTL',
  })
  @ApiResponse({ status: HttpStatus.OK })
  async expireLikes() {
    return this.maintenanceService.voidPendingLikes();
  }
}
