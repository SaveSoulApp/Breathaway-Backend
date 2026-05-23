import { timingSafeEqual } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SWAGGER_PROTECTED_PATHS } from './swagger.constants';

/**
 * Applies an HTTP Basic Auth middleware that guards all Swagger UI routes.
 *
 * - Only intercepts requests matching `SWAGGER_PATHS`; all other routes pass through.
 * - Uses `timingSafeEqual` to prevent timing-based brute-force attacks on credentials.
 * - Credentials are resolved via `ConfigService` (backed by GCP Secret Manager in production).
 * - Responds with `WWW-Authenticate: Basic` to trigger the browser's native login dialog.
 */
export function applySwaggerBasicAuth(
  app: INestApplication,
  configService: ConfigService,
): void {
  const username = configService.getOrThrow<string>('SWAGGER_USERNAME');
  const password = configService.getOrThrow<string>('SWAGGER_PASSWORD');

  const expectedUser = Buffer.from(username);
  const expectedPass = Buffer.from(password);

  const isValidCredential = (input: Buffer, expected: Buffer): boolean => {
    // Buffers must be the same length before comparing to avoid leaking length info
    if (input.length !== expected.length) return false;
    return timingSafeEqual(input, expected);
  };

  app.use(
    (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
      const url = req.url ?? '';
      const isSwaggerRoute = SWAGGER_PROTECTED_PATHS.some(
        (path) =>
          url === `/${path}` ||
          url.startsWith(`/${path}/`) ||
          url.startsWith(`/${path}-`),
      );

      if (!isSwaggerRoute) {
        next();
        return;
      }

      const authHeader = req.headers['authorization'];

      if (authHeader?.startsWith('Basic ')) {
        const base64Credentials = authHeader.slice('Basic '.length);
        const decoded = Buffer.from(base64Credentials, 'base64').toString(
          'utf8',
        );
        const separatorIndex = decoded.indexOf(':');

        if (separatorIndex !== -1) {
          const providedUser = Buffer.from(decoded.slice(0, separatorIndex));
          const providedPass = Buffer.from(decoded.slice(separatorIndex + 1));

          if (
            isValidCredential(providedUser, expectedUser) &&
            isValidCredential(providedPass, expectedPass)
          ) {
            next();
            return;
          }
        }
      }

      // Respond with 401 and trigger the browser's native credential dialog
      res.writeHead(401, {
        'WWW-Authenticate':
          'Basic realm="BreathAway API Docs", charset="UTF-8"',
        'Content-Type': 'text/plain',
      });
      res.end('Unauthorized');
    },
  );
}
