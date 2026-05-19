import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AuthModule } from '@modules/auth/auth.module';
import { BlockModule } from '@modules/blocks/blocks.module';
import { IdentityModule } from '@modules/identities/identities.module';
import { InstagramModule } from '@modules/instagram/instagram.module';
import { WebhooksModule } from '@modules/webhooks/webhooks.module';

export function setupSwagger(app: INestApplication): void {
  publicApiDocumentation(app);

  adminApiDocumentation(app);
}

function publicApiDocumentation(app: INestApplication) {
  const publicModules = [AuthModule, IdentityModule, BlockModule];
  const publicConfig = new DocumentBuilder()
    .setTitle('BreathAway APIs')
    .setDescription('BreathAway APIs - REST APIs for BreathAway App')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const publicDoc = SwaggerModule.createDocument(app, publicConfig, {
    include: publicModules,
  });
  SwaggerModule.setup('api/public', app, publicDoc, {
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
}

function adminApiDocumentation(app: INestApplication) {
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
  SwaggerModule.setup('api/admin', app, adminDoc, {
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
}
