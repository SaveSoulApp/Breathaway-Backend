import { OneTimePasswordsModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health';

@Module({
  imports: [TerminusModule, OneTimePasswordsModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
