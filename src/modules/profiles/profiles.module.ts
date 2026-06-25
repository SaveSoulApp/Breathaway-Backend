import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

/**
 * Encapsulates the user profile bounded context — creating, reading, updating,
 * and soft-deleting a user's profile and associated account data (identities,
 * auth credentials, devices).
 *
 * Imports:
 *   - None: `PrismaService` and `LoggerService` are registered globally and
 *     injected via NestJS's DI container without an explicit module import.
 *
 * Exports:
 *   - None: `ProfilesService` is not consumed by any other module; profile
 *     data access is always routed through this module's HTTP layer.
 */
@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
