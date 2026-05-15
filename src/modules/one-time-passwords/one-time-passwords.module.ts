import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { OtpController } from './one-time-passwords.controller';
import { OtpService } from './one-time-passwords.service';

@Module({
  controllers: [OtpController],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error('REDIS_URL environment variable is not defined');
        }
        return new Redis(redisUrl);
      },
    },
    OtpService,
  ],
  exports: [OtpService, 'REDIS_CLIENT'],
})
export class OtpModule {}
