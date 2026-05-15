import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  ApiKeyMiddleware,
  ClientIdMiddleware,
  DeviceIdMiddleware,
  MiddlewareModule,
  RequestIdMiddleware,
  TimezoneMiddleware,
  UserAgentMiddleware,
} from './common/middleware';
import { GcpSecretManagerModule } from './core/gcp-secret-manager/gcp-secret-manager.module';
import { LoggerModule } from './core/logger/logger.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlockModule } from './modules/blocks/block.module';
import { DeviceModule } from './modules/devices/device.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { IdentityModule } from './modules/identities/identity.module';
import { InstagramModule } from './modules/instagram/instagram.module';
import { LikeModule } from './modules/likes/like.module';
import { MatchResolverModule } from './modules/match-resolver/match-resolver.module';
import { MatchModule } from './modules/matches/match.module';
import { OtpModule } from './modules/one-time-passwords/otp.module';
import { ProfileModule } from './modules/profiles/profile.module';
import { SocialidentityModule } from './modules/social-identities/socialidentity.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
      cache: true,
    }),
    //Rate limiting for the entire application
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
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
    SocialidentityModule,
    WebhooksModule,
    OtpModule,
    InstagramModule,
    ProfileModule,
    DeviceModule,
    IdentityModule,
    LikeModule,
    BlockModule,
    MatchModule,
    MatchResolverModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        ClientIdMiddleware,
        ApiKeyMiddleware,
        UserAgentMiddleware,
        RequestIdMiddleware,
        DeviceIdMiddleware,
        TimezoneMiddleware,
      )
      .exclude(
        { path: 'api/v1/cron/*path', method: RequestMethod.ALL },
        { path: 'v1/cron/*path', method: RequestMethod.ALL },
        { path: 'api/v1/webhooks/meta', method: RequestMethod.GET },
        { path: 'v1/webhooks/meta', method: RequestMethod.GET },
        { path: 'api/v1/webhooks/meta', method: RequestMethod.POST },
        { path: 'v1/webhooks/meta', method: RequestMethod.POST },
      )
      .forRoutes('*'); // Apply to all routes
  }
}
