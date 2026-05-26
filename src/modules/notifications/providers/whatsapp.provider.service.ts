import { Injectable } from '@nestjs/common';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { INotificationProvider } from './notification-provider.interface';
import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';

@Injectable()
export class WhatsAppProviderService
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
      `WhatsApp provider not yet fully implemented. Would send to ${payloadDto.userIds.length} users.`,
    );
    // TODO: Implement actual WhatsApp sending logic via Twilio etc.
    return Promise.resolve();
  }
}
