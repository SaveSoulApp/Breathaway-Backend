import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request, { Test as SupertestChain } from 'supertest';
import { App } from 'supertest/types';

function extractFirstKey(
  parsed: unknown,
  preferredPlatform = 'ios',
): string | undefined {
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed[0];
  }
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, string[]>;
    const platformKeys = record[preferredPlatform.toLowerCase()];
    if (Array.isArray(platformKeys) && platformKeys.length > 0) {
      return platformKeys[0];
    }
    const anyKeys = Object.values(record).flat();
    if (anyKeys.length > 0) {
      return anyKeys[0];
    }
  }
  return undefined;
}

/**
 * Reads the mandatory client-identity header values from env (set by .env.test).
 * These mirror what a real mobile client sends on every request.
 */
function getClientIdentityHeaders(
  app: INestApplication,
): Record<string, string> {
  const config = app.get(ConfigService);

  let rawApiKeys: unknown = [];
  try {
    rawApiKeys = JSON.parse(config.get<string>('API_KEYS', '[]'));
  } catch {
    rawApiKeys = [];
  }

  let rawClientIds: unknown = [];
  try {
    rawClientIds = JSON.parse(config.get<string>('CLIENT_IDS', '[]'));
  } catch {
    rawClientIds = [];
  }

  const appName = config.get<string>('APP_NAME', 'BreathAway');
  const minVersion = config.get<string>('MIN_APP_VERSION', '1.0.0');

  let platforms: string[] = ['iOS'];
  try {
    platforms = JSON.parse(config.get<string>('REQUIRED_PLATFORMS', '["iOS"]'));
  } catch {
    platforms = ['iOS'];
  }

  const platform = platforms[0] ?? 'iOS';
  const apiKey = extractFirstKey(rawApiKeys, platform) ?? 'test-api-key';
  const clientId = extractFirstKey(rawClientIds, platform) ?? 'test-client-id';

  return {
    'x-api-key': apiKey,
    'x-client-id': clientId,
    'x-device-id': 'e2e-test-device-001',
    'x-user-agent': `${appName}/${minVersion} (${platform} 17.0; TestDevice)`,
    'x-timezone': 'UTC',
  };
}

/**
 * Returns a supertest agent pre-loaded with the mandatory client-identity headers.
 * Use this as the entry point for all E2E HTTP requests in the auth suite.
 */
export function authedRequest(app: INestApplication): {
  get: (url: string) => SupertestChain;
  post: (url: string) => SupertestChain;
  put: (url: string) => SupertestChain;
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
    put: (url: string) => attach(request(server).put(url)),
    patch: (url: string) => attach(request(server).patch(url)),
    delete: (url: string) => attach(request(server).delete(url)),
  };
}
