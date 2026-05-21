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
import {
  MiddlewareModule,
  RequestIdMiddleware,
  TimezoneMiddleware,
} from './common/middlewares';
import { GcpSecretManagerModule } from './core/gcp-secret-manager/gcp-secret-manager.module';
import { LoggerModule } from './core/logger';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlockModule } from './modules/blocks/blocks.module';
import { CreditsModule } from './modules/credits/credits.module';
import { DeviceModule } from './modules/devices/devices.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { IdentityModule } from './modules/identities/identities.module';
import { InstagramModule } from './modules/instagram/instagram.module';
import { LikeModule } from './modules/likes/likes.module';
import { MatchResolverModule } from './modules/match-resolver/match-resolver.module';
import { MatchModule } from './modules/matches/matches.module';
import { OtpModule } from './modules/one-time-passwords/one-time-passwords.module';
import { ProfileModule } from './modules/profiles/profiles.module';
import { PubSubModule } from './modules/pubsub/pubsub.module';
import { SocialidentityModule } from './modules/social-identities/social-identities.module';
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
    CreditsModule,
    PubSubModule,
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
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, TimezoneMiddleware).forRoutes('*'); // Apply to all routes
  }
}
