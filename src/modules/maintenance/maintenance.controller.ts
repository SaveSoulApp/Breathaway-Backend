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
   * Triggers the credit-bundle expiry fan-out: paginates all users with
   * expired CREDIT rows and publishes one `credit.expiry.batch` Pub/Sub
   * message per page. Actual expiration runs asynchronously via push delivery
   * to `CreditsService.handleExpiryBatch`.
   *
   * Intended to be called daily by GCP Cloud Scheduler. Returns a lightweight
   * summary of how many batches were published and how many users were enqueued.
   *
   * @returns `{ batchesPublished, totalUsersEnqueued }`
   */
  @Post('expire-bundles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fan-out credit bundle expiry batches to Pub/Sub' })
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

  @Post('expire-subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run job to expire active subscriptions past their expiry date',
  })
  @ApiResponse({ status: HttpStatus.OK })
  async expireSubscriptions() {
    return this.maintenanceService.expireSubscriptions();
  }

  @Post('warn-expiring-bundles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fan-out warnings for credit bundles expiring in 7 days',
  })
  @ApiResponse({ status: HttpStatus.OK })
  async warnExpiringBundles() {
    return this.maintenanceService.warnExpiringCreditBundles();
  }
}
