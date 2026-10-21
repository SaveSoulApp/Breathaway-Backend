import { join } from 'path';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import redoc from 'redoc-express';

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
import { MaintenanceModule } from '@modules/maintenance/maintenance.module';
import { MatchesModule } from '@modules/matches/matches.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OneTimePasswordsModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { PreferencesModule } from '@modules/preferences/preferences.module';
import { ProfilesModule } from '@modules/profiles/profiles.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { SocialIdentitiesModule } from '@modules/social-identities/social-identities.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';
import { TransactionsModule } from '@modules/transactions/transactions.module';
import { UsersModule } from '@modules/users/users.module';
import { WebhooksModule } from '@modules/webhooks/webhooks.module';

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
  app.use(`/${DOCS_PATH}`, express.static(join(process.cwd(), 'docs/build')));

  publicApiDocumentation(app);
  adminApiDocumentation(app);
}

function publicApiDocumentation(app: INestApplication): void {
  // All mobile-facing and external webhook modules. Excludes: FirebaseModule (no HTTP controller),
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
    NotificationsModule,
    OneTimePasswordsModule,
    PaymentsModule,
    PreferencesModule,
    ProfilesModule,
    SubscriptionsModule,
    UsersModule,
    WebhooksModule,
  ];
  const publicConfig = new DocumentBuilder()
    .setTitle('BreathAway APIs')
    .setDescription('BreathAway APIs - REST APIs for BreathAway App')
    .setVersion('1.0')
    .addBearerAuth()
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Enter Google Cloud OIDC ID token generated via: gcloud auth print-identity-token',
      },
      'gcp-oidc',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-request-id',
        in: 'header',
        description: 'A unique identifier for the request (UUID)',
      },
      'x-request-id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-timezone',
        in: 'header',
        description: 'The timezone of the client (e.g., Asia/Kolkata)',
      },
      'x-timezone',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'API Key for Client Application',
      },
      'x-api-key',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-client-id',
        in: 'header',
        description: 'Client ID',
      },
      'x-client-id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-device-id',
        in: 'header',
        description:
          'Unique Device Identifier (persistent client UUID on Web or hardware/vendor ID on mobile)',
      },
      'x-device-id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-user-agent',
        in: 'header',
        description:
          'Client Application Information (e.g., BreathAway/1.0.0 (iOS 17.0; iPhone15) or BreathAway/1.0.0 (Web macOS; Chrome))',
      },
      'x-user-agent',
    )
    .build();

  const publicDoc = SwaggerModule.createDocument(app, publicConfig, {
    include: publicModules,
  });

  // Deep sanitization: ensure no admin paths or admin tags leak into public OpenAPI spec
  Object.keys(publicDoc.paths).forEach((path) => {
    if (
      path.toLowerCase().includes('/admin') ||
      path.endsWith('/notifications/send') ||
      path.includes('/social-identities') ||
      path.includes('/internal/jobs')
    ) {
      delete publicDoc.paths[path];
    } else {
      const pathItem = publicDoc.paths[path] as Record<string, unknown>;
      if (pathItem && typeof pathItem === 'object') {
        Object.values(pathItem).forEach((operation: unknown) => {
          if (
            operation &&
            typeof operation === 'object' &&
            'tags' in operation &&
            Array.isArray((operation as { tags?: string[] }).tags)
          ) {
            const op = operation as { tags: string[] };
            op.tags = op.tags.filter(
              (tag) => !tag.toLowerCase().startsWith('admin'),
            );
          }
        });
      }
    }
  });

  if (publicDoc.tags) {
    publicDoc.tags = publicDoc.tags.filter(
      (tag) => !tag.name.toLowerCase().startsWith('admin'),
    );
  }

  applyGlobalSecurityToOperations(publicDoc, [
    'x-request-id',
    'x-timezone',
    'x-api-key',
    'x-client-id',
    'x-device-id',
    'x-user-agent',
  ]);

  sortOpenApiDocument(publicDoc);

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
  const publicRedocHandler = redoc({
    title: 'BreathAway Public API Docs',
    specUrl: `/${SWAGGER_PUBLIC_PATH}-json`,
    redocOptions: {
      sortTagsAlphabetically: true,
      sortOperationsAlphabetically: true,
      theme: {
        colors: {
          primary: {
            main: '#000000',
          },
        },
      },
    },
  });

  httpAdapter.get(
    `/${SWAGGER_PUBLIC_PATH}/${REDOC_SUBPATH}`,
    (req: express.Request, res: express.Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      publicRedocHandler(req, res);
    },
  );
}

function adminApiDocumentation(app: INestApplication): void {
  const adminModules = [
    AdminModule,
    IdentityWorkflowsModule,
    InstagramModule,
    MaintenanceModule,
    NotificationsModule,
    ReportsModule,
    SocialIdentitiesModule,
    TransactionsModule,
  ];
  const adminConfig = new DocumentBuilder()
    .setTitle('BreathAway Admin APIs')
    .setDescription(
      'BreathAway Admin APIs - REST APIs for BreathAway Admin App',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Enter Google Cloud OIDC ID token generated via: gcloud auth print-identity-token',
      },
      'gcp-oidc',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-request-id',
        in: 'header',
        description: 'A unique identifier for the request (UUID)',
      },
      'x-request-id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-timezone',
        in: 'header',
        description: 'The timezone of the client (e.g., Asia/Kolkata)',
      },
      'x-timezone',
    )
    .build();

  const adminDoc = SwaggerModule.createDocument(app, adminConfig, {
    include: adminModules,
  });

  // Deep sanitization: ensure public payment checkout and notification inbox endpoints do not appear in admin OpenAPI spec
  Object.keys(adminDoc.paths).forEach((path) => {
    if (path.startsWith('/api/v1/payments') && !path.includes('/admin/')) {
      delete adminDoc.paths[path];
    } else if (
      path.startsWith('/api/v1/notifications') &&
      !path.endsWith('/notifications/send')
    ) {
      delete adminDoc.paths[path];
    } else if (path.includes('/admin/database/truncate')) {
      delete adminDoc.paths[path];
    } else {
      const pathItem = adminDoc.paths[path] as Record<string, unknown>;
      if (pathItem && typeof pathItem === 'object') {
        Object.values(pathItem).forEach((operation: unknown) => {
          if (
            operation &&
            typeof operation === 'object' &&
            'tags' in operation &&
            Array.isArray((operation as { tags?: string[] }).tags)
          ) {
            const op = operation as { tags: string[] };
            op.tags = op.tags.filter(
              (tag) => tag !== 'Payments' && tag !== 'Notifications',
            );
          }
        });
      }
    }
  });

  if (adminDoc.tags) {
    adminDoc.tags = adminDoc.tags.filter(
      (tag) => tag.name !== 'Payments' && tag.name !== 'Notifications',
    );
  }

  applyGlobalSecurityToOperations(adminDoc, ['x-request-id', 'x-timezone']);

  sortOpenApiDocument(adminDoc);

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
  const adminRedocHandler = redoc({
    title: 'BreathAway Admin API Docs',
    specUrl: `/${SWAGGER_ADMIN_PATH}-json`,
    redocOptions: {
      sortTagsAlphabetically: true,
      sortOperationsAlphabetically: true,
      theme: {
        colors: {
          primary: {
            main: '#000000',
          },
        },
      },
    },
  });

  httpAdapter.get(
    `/${SWAGGER_ADMIN_PATH}/${REDOC_SUBPATH}`,
    (req: express.Request, res: express.Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      adminRedocHandler(req, res);
    },
  );
}

function sortOpenApiDocument(document: OpenAPIObject): void {
  const tagsSet = new Set<string>();
  const httpMethods = [
    'get',
    'post',
    'put',
    'delete',
    'patch',
    'options',
    'head',
  ] as const;

  if (document.paths) {
    // Sort paths alphabetically by URL key
    const sortedPaths: OpenAPIObject['paths'] = {};
    Object.keys(document.paths)
      .sort((a, b) => a.localeCompare(b))
      .forEach((pathKey) => {
        sortedPaths[pathKey] = document.paths[pathKey];
        const pathItem = document.paths[pathKey] as Record<string, unknown>;
        if (pathItem && typeof pathItem === 'object') {
          httpMethods.forEach((method) => {
            const operation = pathItem[method] as
              | { tags?: string[] }
              | undefined;
            if (operation && Array.isArray(operation.tags)) {
              operation.tags.sort((t1, t2) => t1.localeCompare(t2));
              operation.tags.forEach((tag) => {
                if (tag && typeof tag === 'string' && tag.trim().length > 0) {
                  tagsSet.add(tag.trim());
                }
              });
            }
          });
        }
      });
    document.paths = sortedPaths;
  }

  // Preserve existing tag descriptions and metadata while sorting tags alphabetically
  type TagObject = NonNullable<OpenAPIObject['tags']>[number];
  const existingTagsMap = new Map<string, TagObject>();
  if (Array.isArray(document.tags)) {
    document.tags.forEach((tag) => {
      if (tag && tag.name) {
        tagsSet.add(tag.name);
        existingTagsMap.set(tag.name, tag);
      }
    });
  }

  const sortedTagNames = Array.from(tagsSet).sort((a, b) => a.localeCompare(b));

  document.tags = sortedTagNames.map(
    (name) => existingTagsMap.get(name) || { name },
  );
}

function applyGlobalSecurityToOperations(
  document: OpenAPIObject,
  extraSecurityKeys: string[],
): void {
  Object.values(document.paths).forEach((pathItem) => {
    if (!pathItem) return;
    Object.values(pathItem).forEach((operation: unknown) => {
      if (
        operation &&
        typeof operation === 'object' &&
        !Array.isArray(operation)
      ) {
        const op = operation as Record<string, unknown>;
        if (!op.security) {
          op.security = [];
        }
        const security = op.security as Record<string, string[]>[];
        if (security.length === 0) {
          const req: Record<string, string[]> = {};
          extraSecurityKeys.forEach((key) => {
            req[key] = [];
          });
          security.push(req);
        } else {
          security.forEach((req) => {
            extraSecurityKeys.forEach((key) => {
              req[key] = [];
            });
          });
        }
      }
    });
  });
}
