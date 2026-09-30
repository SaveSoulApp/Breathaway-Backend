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

import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { GcpOidcAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { InstagramService } from '@modules/instagram/instagram.service';
import { PaymentsReconciliationService } from '@modules/payments/payments.reconciliation';

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
    private readonly paymentsReconciliationService: PaymentsReconciliationService,
    private readonly instagramService: InstagramService,
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

  /**
   * Triggers the payment reconciliation job, which polls all PENDING
   * `PaymentOrder` rows older than 15 minutes against the payment gateway and
   * settles their status (PAID / FAILED / EXPIRED).
   *
   * Intended to be called every 2 minutes by GCP Cloud Scheduler. Running as
   * an HTTP-triggered job ensures exactly one execution per tick, regardless
   * of how many Cloud Run instances are active.
   *
   * @returns A summary `{ total, settled, failed, expired }` of the run.
   */
  @Post('reconcile-payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reconcile stale PENDING payment orders against the gateway',
  })
  @ApiResponse({ status: HttpStatus.OK })
  async reconcilePayments() {
    return this.paymentsReconciliationService.reconcileStaleOrders();
  }

  /**
   * Refreshes the system-level Instagram access token via the Graph API and
   * persists the updated token directly to GCP Secret Manager.
   *
   * Intended to be called monthly (1st of every month at midnight UTC) by
   * GCP Cloud Scheduler targeting the internal maintenance service.
   *
   * @returns The Graph API refresh response payload.
   */
  @Post('rotate-instagram-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate Instagram access token and update GCP Secret Manager',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Instagram access token refreshed successfully',
  })
  async rotateInstagramToken(): Promise<unknown> {
    return this.instagramService.refreshSystemAccessToken();
  }
}
