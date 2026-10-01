import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminBasicAuthGuard } from '@modules/admin/guards/admin-basic-auth.guard';

import { SendNotificationRequestDto, SendNotificationResponseDto } from './dto';
import { NotificationsService } from './notifications.service';

/**
 * Administrative HTTP controller for notification operations.
 *
 * Dedicated to administrative multi-channel dispatch (Push, Email, SMS).
 * Protected at class level with HTTP Basic Authentication (`AdminBasicAuthGuard`).
 */
@ApiTags('Notifications (Admin)')
@SkipClientIdentity()
@ApiStandardErrors()
@Controller({
  path: 'notifications',
  version: ['1'],
})
@UseGuards(AdminBasicAuthGuard)
@ApiBasicAuth()
export class NotificationsAdminController extends BaseController {
  constructor(
    loggerService: LoggerService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(loggerService);
  }

  /**
   * Dispatches a multi-channel notification (Push, Email, SMS) to target users.
   *
   * Queues the request via Google Cloud Pub/Sub for asynchronous processing and delivery.
   */
  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Dispatch multi-channel notifications (Admin)',
    description:
      'Queues multi-channel notifications (Push, Email, SMS) for specified users via Pub/Sub. Requires HTTP Basic Auth with admin credentials.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Notification dispatch requested and queued successfully.',
    type: SendNotificationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing admin Basic Auth credentials.',
  })
  async send(
    @Body() dto: SendNotificationRequestDto,
  ): Promise<SendNotificationResponseDto> {
    await this.notificationsService.dispatch(dto);

    return {
      success: true,
      message: `Notification dispatch requested for ${dto.userIds.length} users`,
      userCount: dto.userIds.length,
    };
  }
}
