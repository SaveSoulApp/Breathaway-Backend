import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { DsarExportResponseDto, RequestDsarExportRequestDto } from './dto';
import { DsarExportService } from './services/dsar-export.service';

/**
 * Controller exposing authenticated user data subject rights endpoints.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'users',
  version: ['1'],
})
export class UsersController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly dsarExportService: DsarExportService,
  ) {
    super(logger);
  }

  /**
   * Requests a machine-readable data export under GDPR Article 15/20 & CCPA § 1798.110.
   *
   * Asynchronously initiates the export pipeline. Responds immediately with 202 Accepted
   * and the encryption passphrase. The client does not wait for extraction. When processing
   * completes, a notification is sent directing the user to download the archive in-app.
   *
   * @param userId - Unique identifier of the authenticated user.
   * @param dto - Optional user-defined encryption passphrase and cooldown override flag.
   * @returns DsarExportResponseDto with status PENDING and the encryption passphrase.
   */
  @Post('me/export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request personal data export (GDPR / CCPA data portability)',
    description:
      'Initiates an asynchronous export of all personal data. Responds immediately with status PENDING and the AES-256 encryption passphrase.',
  })
  @ApiBody({
    type: RequestDsarExportRequestDto,
    required: false,
    description:
      'Optional custom AES-256 passphrase and cooldown override flag',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Data export request accepted and queued for processing',
    type: DsarExportResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'An export request is already in progress',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User account not found or deleted',
  })
  @SerializeExpose(DsarExportResponseDto)
  async requestExport(
    @CurrentUserId() userId: string,
    @Body() dto: RequestDsarExportRequestDto = {},
  ): Promise<DsarExportResponseDto> {
    return this.dsarExportService.requestExport(userId, dto);
  }

  /**
   * Retrieves the latest export request status and dynamically generates a download URL.
   *
   * When status is COMPLETED and within the 7-day retention period, dynamically generates
   * a fresh, short-lived V4 signed Cloud Storage URL (valid for 1 hour).
   *
   * @param userId - Unique identifier of the authenticated user.
   * @returns DsarExportResponseDto with current status and active downloadUrl.
   */
  @Get('me/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get latest personal data export status and download URL',
    description:
      'Returns the current status of the latest export request. When COMPLETED, dynamically generates a fresh 1-hour signed download URL.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Latest export record retrieved successfully',
    type: DsarExportResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No export request found for this account',
  })
  @SerializeExpose(DsarExportResponseDto)
  async getLatestExport(
    @CurrentUserId() userId: string,
  ): Promise<DsarExportResponseDto> {
    return this.dsarExportService.getLatestExport(userId);
  }
}
