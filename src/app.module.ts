import { ClientIdentityGuard } from '@common/guards/client-identity.guard';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configureMiddleware, MiddlewareModule } from './common/middlewares';
import { GcpSecretManagerModule } from './core/gcp-secret-manager/gcp-secret-manager.module';
import { LoggerModule } from './core/logger';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { CreditsModule } from './modules/credits/credits.module';
import { DevicesModule } from './modules/devices/devices.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { HealthModule } from './modules/health/health.module';
import { IdentitiesModule } from './modules/identities/identities.module';
import { IdentityWorkflowsModule } from './modules/identity-workflows/identity-workflows.module';
import { InstagramModule } from './modules/instagram/instagram.module';
import { LikesModule } from './modules/likes/likes.module';
import { MatchResolverModule } from './modules/match-resolver/match-resolver.module';
import { MatchesModule } from './modules/matches/matches.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OneTimePasswordsModule } from './modules/one-time-passwords/one-time-passwords.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { PubSubModule } from './modules/pubsub/pubsub.module';
import { SocialIdentitiesModule } from './modules/social-identities/social-identities.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
      cache: true,
    }),
    //Rate limiting for the entire application
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          name: 'short',
          ttl: seconds(1),
          limit: 5,
        },
        {
          name: 'medium',
          ttl: seconds(10),
          limit: 20,
        },
        {
          name: 'long',
          ttl: seconds(60),
          limit: 50,
        },
      ],
    }),

    //Core Modules
    LoggerModule,
    MiddlewareModule,
    PrismaModule,
    GcpSecretManagerModule,
    ScheduleModule.forRoot(),

    //Business Modules
    AuthModule,
    FirebaseModule,
    SocialIdentitiesModule,
    WebhooksModule,
    OneTimePasswordsModule,
    InstagramModule,
    ProfilesModule,
    DevicesModule,
    IdentitiesModule,
    LikesModule,
    BlocksModule,
    MatchesModule,
    MatchResolverModule,
    CreditsModule,
    HealthModule,
    PubSubModule,
    IdentityWorkflowsModule,
    NotificationsModule,
    AdminModule,
    PreferencesModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true, // Strict payload injection protection
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    { provide: APP_GUARD, useClass: ClientIdentityGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    configureMiddleware(consumer);
  }
}
