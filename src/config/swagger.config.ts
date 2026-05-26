import { AuthModule } from '@modules/auth/auth.module';
import { BlockModule } from '@modules/blocks/blocks.module';
import { CreditsModule } from '@modules/credits/credits.module';
import { DeviceModule } from '@modules/devices/devices.module';
import { HealthModule } from '@modules/health/health.module';
import { IdentityModule } from '@modules/identities/identities.module';
import { InstagramModule } from '@modules/instagram/instagram.module';
import { LikeModule } from '@modules/likes/likes.module';
import { MatchModule } from '@modules/matches/matches.module';
import { OtpModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { ProfileModule } from '@modules/profiles/profiles.module';
import { SocialidentityModule } from '@modules/social-identities/social-identities.module';
import { WebhooksModule } from '@modules/webhooks/webhooks.module';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import redoc from 'redoc-express';
import { applySwaggerBasicAuth } from './swagger-basic-auth.config';
import {
  REDOC_SUBPATH,
  SWAGGER_ADMIN_PATH,
  SWAGGER_PUBLIC_PATH,
} from './swagger.constants';

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
): void {
  const isSwaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED') === 'true';

  if (!isSwaggerEnabled) {
    return;
  }

  // Register Basic Auth guard before mounting Swagger UI routes
  applySwaggerBasicAuth(app, configService);

  publicApiDocumentation(app);
  adminApiDocumentation(app);
}

function publicApiDocumentation(app: INestApplication): void {
  // All mobile-facing modules. Excludes: FirebaseModule (no HTTP controller),
  // PubSubModule (internal bus), MatchResolverModule (background job).
  const publicModules = [
    AuthModule,
    BlockModule,
    CreditsModule,
    DeviceModule,
    HealthModule,
    IdentityModule,
    LikeModule,
    MatchModule,
    OtpModule,
    ProfileModule,
    SocialidentityModule,
  ];
  const publicConfig = new DocumentBuilder()
    .setTitle('BreathAway APIs')
    .setDescription('BreathAway APIs - REST APIs for BreathAway App')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const publicDoc = SwaggerModule.createDocument(app, publicConfig, {
    include: publicModules,
  });
  SwaggerModule.setup(SWAGGER_PUBLIC_PATH, app, publicDoc, {
    swaggerOptions: {
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      displayRequestDuration: true,
    },
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'BreathAway Public API Docs',
  });

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get(
    `/${SWAGGER_PUBLIC_PATH}/${REDOC_SUBPATH}`,
    redoc({
      title: 'BreathAway Public API Docs',
      specUrl: `/${SWAGGER_PUBLIC_PATH}-json`,
      redocOptions: {
        theme: {
          colors: {
            primary: {
              main: '#000000',
            },
          },
        },
      },
    }),
  );
}

function adminApiDocumentation(app: INestApplication): void {
  const adminModules = [InstagramModule, WebhooksModule];
  const adminConfig = new DocumentBuilder()
    .setTitle('BreathAway Admin APIs')
    .setDescription(
      'BreathAway Admin APIs - REST APIs for BreathAway Admin App',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const adminDoc = SwaggerModule.createDocument(app, adminConfig, {
    include: adminModules,
  });
  SwaggerModule.setup(SWAGGER_ADMIN_PATH, app, adminDoc, {
    swaggerOptions: {
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      displayRequestDuration: true,
    },
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'BreathAway Admin API Docs',
  });

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get(
    `/${SWAGGER_ADMIN_PATH}/${REDOC_SUBPATH}`,
    redoc({
      title: 'BreathAway Admin API Docs',
      specUrl: `/${SWAGGER_ADMIN_PATH}-json`,
      redocOptions: {
        theme: {
          colors: {
            primary: {
              main: '#000000',
            },
          },
        },
      },
    }),
  );
}
