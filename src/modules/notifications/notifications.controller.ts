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
 * HTTP resource for the /notifications domain.
 *
 * Dedicated to administrative and operational notification dispatch (Push, Email, SMS).
 * All endpoints require HTTP Basic Authentication with admin credentials; this route is
 * never exposed to client JWTs or unauthenticated public traffic.
 */
@ApiTags('Notifications')
@SkipClientIdentity()
@ApiStandardErrors()
@Controller({
  path: 'notifications',
  version: ['1'],
})
@UseGuards(AdminBasicAuthGuard)
@ApiBasicAuth()
export class NotificationsController extends BaseController {
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
   *
   * @param dto - Target user IDs, channel list, and message content.
   * @returns Confirmation that the dispatch request was enqueued.
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
