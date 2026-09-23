import { Module } from '@nestjs/common';

import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

/**
 * Encapsulates the device registration and management bounded context, enabling
 * the platform to track per-user push notification tokens across iOS and Android.
 */
@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
