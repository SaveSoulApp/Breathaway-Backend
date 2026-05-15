import { Module } from '@nestjs/common';
import { DeviceController } from './devices.controller';
import { DeviceService } from './devices.service';

@Module({
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}
