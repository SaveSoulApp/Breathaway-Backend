import { Module } from '@nestjs/common';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

/**
 * Encapsulates the notification preferences bounded context, allowing users to
 * independently toggle push, WhatsApp, SMS, and email notification channels.
 *
 * Imports: none — operates solely on the shared PrismaService provided globally.
 * Exports: PreferencesService — allowing other modules to resolve user preferences.
 */
@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
