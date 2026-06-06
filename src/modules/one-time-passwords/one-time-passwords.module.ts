import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { OneTimePasswordsController } from './one-time-passwords.controller';
import { OneTimePasswordsService } from './one-time-passwords.service';

@Module({
  controllers: [OneTimePasswordsController],
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
    OneTimePasswordsService,
  ],
  exports: [OneTimePasswordsService, 'REDIS_CLIENT'],
})
export class OneTimePasswordsModule {}
