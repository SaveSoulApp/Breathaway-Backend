import { Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { INotificationProvider } from './notification-provider.interface';

@Injectable()
export class WhatsAppProviderService
  extends BaseService
  implements INotificationProvider
{
  constructor(loggerService: LoggerService) {
    super(loggerService);
  }

  async send(
    payloadDto: SendNotificationRequestDto,
    _devices?: Device[],
    _userNotificationIdMap?: Map<string, string>,
  ): Promise<void> {
    if (!payloadDto.userIds || payloadDto.userIds.length === 0) {
      return;
    }

    this.logger.warn(
      'WhatsApp provider not yet fully implemented. Skipping send.',
      {
        userCount: payloadDto.userIds.length,
        step: 'send',
      },
    );
    // TODO: Implement actual WhatsApp sending logic via Twilio etc.
    return Promise.resolve();
  }
}
