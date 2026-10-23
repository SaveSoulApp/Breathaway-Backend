import { randomUUID } from 'crypto';

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Request } from 'express';
import { ClsModule } from 'nestjs-cls';

import { ClientIdentityGuard } from '@common/guards/client-identity.guard';
import { extractClientIp } from '@common/utils/request.utils';
import { UserAgentUtils } from '@common/utils/user-agent.utils';
import { AppValidationPipe } from '@core/pipes';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  DecryptionInterceptor,
  TimezoneResponseInterceptor,
} from './common/interceptors';
import { configureMiddleware, MiddlewareModule } from './common/middlewares';
import { corsConfig } from './config/cors.config';
import {
  envValidationOptions,
  envValidationSchema,
} from './config/env.validation';
import { GcpSecretManagerModule } from './core/gcp-secret-manager/gcp-secret-manager.module';
import { IdentityCryptoModule } from './core/identity-crypto/identity-crypto.module';
import { LoggerModule } from './core/logger';
import { BigQueryModule } from './infrastructure/bigquery/bigquery.module';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { HttpClientModule } from './infrastructure/http';
import {
  RedisModule,
  ThrottlerStorageRedisService,
} from './infrastructure/redis';
import { GcpStorageModule } from './infrastructure/storage/gcp-storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { ChatsModule } from './modules/chats/chats.module';
import { CreditsModule } from './modules/credits/credits.module';
import { DevicesModule } from './modules/devices/devices.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { HealthModule } from './modules/health/health.module';
import { IdentitiesModule } from './modules/identities/identities.module';
import { IdentityWorkflowsModule } from './modules/identity-workflows/identity-workflows.module';
import { InstagramModule } from './modules/instagram/instagram.module';
import { LikesModule } from './modules/likes/likes.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { MatchResolverModule } from './modules/match-resolver/match-resolver.module';
import { MatchesModule } from './modules/matches/matches.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OneTimePasswordsModule } from './modules/one-time-passwords/one-time-passwords.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { PubSubModule } from './modules/pubsub/pubsub.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SocialIdentitiesModule } from './modules/social-identities/social-identities.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
      cache: true,
      load: [corsConfig],
      validationSchema: envValidationSchema,
      validationOptions: envValidationOptions,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request) => {
          cls.set('requestStart', Date.now());

          // Extract public client IP (GCP Cloud Load Balancer / reverse proxy aware)
          cls.set('ipAddress', extractClientIp(req));

          // Extract user agent using canonical resolution (mobile x-user-agent vs native browser user-agent)
          cls.set(
            'userAgent',
            UserAgentUtils.resolveCanonicalUserAgent(req.headers),
          );

          // Extract device identifier
          const deviceId = req.headers['x-device-id'];
          cls.set(
            'deviceId',
            typeof deviceId === 'string'
              ? deviceId.trim()
              : Array.isArray(deviceId) && deviceId.length > 0
                ? deviceId[0]?.trim()
                : undefined,
          );

          const requestId = req.headers['x-request-id'] || randomUUID();
          cls.set('requestId', requestId);

          const traceContext = req.headers['x-cloud-trace-context'];
          if (traceContext) {
            cls.set('traceContext', traceContext);
          }
        },
      },
    }),
    //Rate limiting for the entire application
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ThrottlerStorageRedisService],
      useFactory: (storage: ThrottlerStorageRedisService) => ({
        storage,
        getTracker: (req: Record<string, unknown>) =>
          extractClientIp(req) || '127.0.0.1',
        throttlers: [
          // Disabled to reduce Redis key creation and command volume:
          // {
          //   name: 'short',
          //   ttl: seconds(1),
          //   limit: 5,
          // },
          {
            name: 'medium',
            ttl: seconds(10),
            limit: 20,
          },
          // {
          //   name: 'long',
          //   ttl: seconds(60),
          //   limit: 50,
          // },
        ],
      }),
    }),

    //Core Modules
    LoggerModule,
    MiddlewareModule,
    PrismaModule,
    HttpClientModule,
    RedisModule,
    GcpSecretManagerModule,
    IdentityCryptoModule,
    GcpStorageModule,
    BigQueryModule,
    EventEmitterModule.forRoot(),

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
    AuditModule,
    ChatsModule,
    ReportsModule,
    SessionsModule,
    SubscriptionsModule,
    TransactionsModule,
    PaymentsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DecryptionInterceptor,
    TimezoneResponseInterceptor,
    {
      provide: APP_PIPE,
      useValue: new AppValidationPipe(),
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
