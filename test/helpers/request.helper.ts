import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request, { Test as SupertestChain } from 'supertest';
import { App } from 'supertest/types';

/**
 * Reads the mandatory client-identity header values from env (set by .env.test).
 * These mirror what a real mobile client sends on every request.
 */
function getClientIdentityHeaders(app: INestApplication): Record<string, string> {
  const config = app.get(ConfigService);

  // API_KEYS and CLIENT_IDS are JSON arrays in .env.test  e.g. '["test-api-key"]'
  const apiKeys = JSON.parse(config.get<string>('API_KEYS', '[]')) as string[];
  const clientIds = JSON.parse(config.get<string>('CLIENT_IDS', '[]')) as string[];
  const appName = config.get<string>('APP_NAME', 'BreathAway');
  const minVersion = config.get<string>('MIN_APP_VERSION', '1.0.0');
  const platforms = JSON.parse(
    config.get<string>('REQUIRED_PLATFORMS', '["iOS"]'),
  ) as string[];

  const apiKey = apiKeys[0] ?? 'test-api-key';
  const clientId = clientIds[0] ?? 'test-client-id';
  const platform = platforms[0] ?? 'iOS';

  return {
    'x-api-key': apiKey,
    'x-client-id': clientId,
    'x-device-id': 'e2e-test-device-001',
    'user-agent': `${appName}/${minVersion} (${platform} 17.0; TestDevice)`,
  };
}

/**
 * Returns a supertest agent pre-loaded with the mandatory client-identity headers.
 * Use this as the entry point for all E2E HTTP requests in the auth suite.
 */
export function authedRequest(app: INestApplication): {
  get: (url: string) => SupertestChain;
  post: (url: string) => SupertestChain;
  patch: (url: string) => SupertestChain;
  delete: (url: string) => SupertestChain;
} {
  const server = app.getHttpServer() as App;
  const headers = getClientIdentityHeaders(app);

  const attach = (chain: SupertestChain): SupertestChain => {
    let r = chain;
    for (const [key, value] of Object.entries(headers)) {
      r = r.set(key, value);
    }
    return r;
  };

  return {
    get: (url: string) => attach(request(server).get(url)),
    post: (url: string) => attach(request(server).post(url)),
    patch: (url: string) => attach(request(server).patch(url)),
    delete: (url: string) => attach(request(server).delete(url)),
  };
}
