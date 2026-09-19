import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { serializeError } from '@common/utils/error.utils';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import { HealthResponseDto, ReadyResponseDto } from './dto';

@ApiTags('Health')
@SkipClientIdentity()
@Controller({
  version: VERSION_NEUTRAL,
})
export class HealthController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly prismaService: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Liveness probe for GCP Cloud Run and GKE load balancers.
   *
   * Mounted at app root /health without API versioning prefix.
   * Unauthenticated and bypasses client identity checks.
   *
   * @returns 200 { status: 'ok' }
   */
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is alive',
    type: HealthResponseDto,
  })
  checkHealth(): HealthResponseDto {
    return { status: 'ok' };
  }

  /**
   * Readiness probe for GCP Cloud Run and GKE load balancers.
   *
   * Verifies Prisma database connectivity before accepting traffic.
   * Mounted at app root /ready without API versioning prefix.
   *
   * @returns 200 { status: 'ok', db: 'connected' }
   * @throws {ServiceUnavailableException} When database connectivity check fails.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is ready to handle traffic',
    type: ReadyResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Service is not ready (database unreachable)',
  })
  async checkReady(): Promise<ReadyResponseDto> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected' };
    } catch (error) {
      this.logger.warn('Readiness probe failed: database unreachable', {
        err: serializeError(error),
        step: 'checkReady',
      });
      throw new ServiceUnavailableException('Database is unreachable');
    }
  }
}
