import { Injectable } from '@nestjs/common';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { INotificationProvider } from './notification-provider.interface';
import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';

@Injectable()
export class EmailProviderService
  extends BaseService
  implements INotificationProvider
{
  constructor(loggerService: LoggerService) {
    super(loggerService);
  }

  async send(payloadDto: SendNotificationRequestDto): Promise<void> {
    if (!payloadDto.userIds || payloadDto.userIds.length === 0) {
      return;
    }

    this.logger.warn(
      `Email provider not yet fully implemented. Would send to ${payloadDto.userIds.length} users.`,
    );
    // TODO: Implement actual email sending logic via SendGrid/AWS SES etc.
    return Promise.resolve();
  }
}
