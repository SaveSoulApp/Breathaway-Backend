import { Module } from '@nestjs/common';

import { IpGeolocationModule } from '@infrastructure/ip-geolocation';
import { AuthModule } from '@modules/auth/auth.module';

import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/**
 * Encapsulates the user session and active device management domain, providing
 * capabilities to view active sessions, correlate device metadata, and remotely
 * revoke active logins across devices.
 */
@Module({
  imports: [AuthModule, IpGeolocationModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
