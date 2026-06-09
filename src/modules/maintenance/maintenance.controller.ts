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
@Controller({
  path: 'internal/jobs',
  version: ['1'],
})
export class MaintenanceController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly maintenanceService: MaintenanceService,
  ) {
    super(logger);
  }

  @Post('expire-bundles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run expiration job for unused credit bundles' })
  @ApiResponse({ status: HttpStatus.OK })
  async expireCreditBundles() {
    return this.maintenanceService.expireCreditBundles();
  }

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
}

