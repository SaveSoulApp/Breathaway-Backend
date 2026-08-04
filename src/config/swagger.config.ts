import { AdminModule } from '@modules/admin/admin.module';
import { AuthModule } from '@modules/auth/auth.module';
import { BlocksModule } from '@modules/blocks/blocks.module';
import { ChatsModule } from '@modules/chats/chats.module';
import { CreditsModule } from '@modules/credits/credits.module';
import { DevicesModule } from '@modules/devices/devices.module';
import { HealthModule } from '@modules/health/health.module';
import { IdentitiesModule } from '@modules/identities/identities.module';
import { IdentityWorkflowsModule } from '@modules/identity-workflows/identity-workflows.module';
import { InstagramModule } from '@modules/instagram/instagram.module';
import { LikesModule } from '@modules/likes/likes.module';
import { MatchesModule } from '@modules/matches/matches.module';
import { OneTimePasswordsModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { PreferencesModule } from '@modules/preferences/preferences.module';
import { ProfilesModule } from '@modules/profiles/profiles.module';
import { SocialIdentitiesModule } from '@modules/social-identities/social-identities.module';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import * as express from 'express';
import { join } from 'path';
import redoc from 'redoc-express';
import { applySwaggerBasicAuth } from './swagger-basic-auth.config';
import {
  DOCS_PATH,
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

  // Serve Docusaurus site statically under /docs
  app.use(
    `/${DOCS_PATH}`,
    express.static(join(process.cwd(), 'docs-site/build')),
  );

  publicApiDocumentation(app);
  adminApiDocumentation(app);
}

function publicApiDocumentation(app: INestApplication): void {
  // All mobile-facing modules. Excludes: FirebaseModule (no HTTP controller),
  // PubSubModule (internal bus), MatchResolverModule (background job).
  const publicModules = [
    AuthModule,
    BlocksModule,
    ChatsModule,
    CreditsModule,
    DevicesModule,
    HealthModule,
    IdentitiesModule,
    LikesModule,
    MatchesModule,
    OneTimePasswordsModule,
    ProfilesModule,
    PreferencesModule,
    SocialIdentitiesModule,
  ];
  const publicConfig = new DocumentBuilder()
    .setTitle('BreathAway APIs')
    .setDescription('BreathAway APIs - REST APIs for BreathAway App')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Request-ID',
        in: 'header',
        description: 'A unique identifier for the request (UUID)',
      },
      'X-Request-ID',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Timezone',
        in: 'header',
        description: 'The timezone of the client (e.g., UTC, America/New_York)',
      },
      'X-Timezone',
    )
    .build();

  const publicDoc = SwaggerModule.createDocument(app, publicConfig, {
    include: publicModules,
  });

  applyGlobalSecurityToOperations(publicDoc);

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
  const adminModules = [InstagramModule, IdentityWorkflowsModule, AdminModule];
  const adminConfig = new DocumentBuilder()
    .setTitle('BreathAway Admin APIs')
    .setDescription(
      'BreathAway Admin APIs - REST APIs for BreathAway Admin App',
    )
    .setVersion('1.0')
    .addBasicAuth()
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Request-ID',
        in: 'header',
        description: 'A unique identifier for the request (UUID)',
      },
      'X-Request-ID',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Timezone',
        in: 'header',
        description: 'The timezone of the client (e.g., UTC, America/New_York)',
      },
      'X-Timezone',
    )
    .build();

  const adminDoc = SwaggerModule.createDocument(app, adminConfig, {
    include: adminModules,
  });

  applyGlobalSecurityToOperations(adminDoc);

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

function applyGlobalSecurityToOperations(document: OpenAPIObject): void {
  Object.values(document.paths).forEach((pathItem) => {
    if (!pathItem) return;
    Object.values(pathItem).forEach((operation: any) => {
      if (
        operation &&
        typeof operation === 'object' &&
        !Array.isArray(operation)
      ) {
        if (!operation.security) {
          operation.security = [];
        }
        if (operation.security.length === 0) {
          operation.security.push({ 'X-Request-ID': [], 'X-Timezone': [] });
        } else {
          operation.security.forEach((req: any) => {
            req['X-Request-ID'] = [];
            req['X-Timezone'] = [];
          });
        }
      }
    });
  });
}
