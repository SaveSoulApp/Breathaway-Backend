import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SendNotificationRequestDto } from './dto/request/send-notification.request.dto';
import { NotificationsService } from './notifications.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller({
  path: 'notifications',
  version: ['1'],
})
export class NotificationsController extends BaseController {
  constructor(
    loggerService: LoggerService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(loggerService);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a notification' })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Notification dispatch requested successfully',
  })
  @HttpCode(HttpStatus.ACCEPTED)
  async send(
    @Body() sendNotificationRequestDto: SendNotificationRequestDto,
  ): Promise<{ success: boolean; message: string; userCount: number }> {
    try {
      await this.notificationsService.dispatch(sendNotificationRequestDto);

      return {
        success: true,
        message: `Notification dispatch requested for ${sendNotificationRequestDto.userIds.length} users`,
        userCount: sendNotificationRequestDto.userIds.length,
      };
    } catch (error) {
      this.logger.error('Failed to process send notification request:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
