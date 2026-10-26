import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UAParser } from 'ua-parser-js';

import { LoggerService } from '@core/logger';
import { UserAgentUtils } from '@common/utils/user-agent.utils';

import {
  Platform,
  UserAgentData,
} from '../interfaces/client-identity.interface';

export const SKIP_CLIENT_IDENTITY_META = 'skipClientIdentity';

interface PlatformKeyConfig {
  allKeys: Set<string>;
  keyPlatformMap: Map<string, Platform>;
}

/**
 * Restricts access based on strict client identity verification, enforcing API keys,
 * client IDs, and required platform/version constraints.
 *
 * Ensures that incoming requests originate from a supported, up-to-date client application
 * and extracts validated identity metadata into the request object.
 */
@Injectable()
export class ClientIdentityGuard implements CanActivate {
  private readonly apiKeyConfig: PlatformKeyConfig;
  private readonly clientIdConfig: PlatformKeyConfig;
  private readonly requiredPlatforms: Set<string>;
  private readonly minAppVersion: string;
  private readonly appName: string;
  private readonly logger;

  constructor(
    loggerService: LoggerService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.logger = loggerService.forContext(ClientIdentityGuard.name);
    this.apiKeyConfig = this.parsePlatformKeyedConfig('API_KEYS', '{}');
    this.clientIdConfig = this.parsePlatformKeyedConfig('CLIENT_IDS', '{}');
    this.requiredPlatforms = this.parsePlatformSet('REQUIRED_PLATFORMS', '[]');

    if (
      this.isProductionEnvironment() &&
      this.requiredPlatforms.has(Platform.POSTMAN)
    ) {
      this.requiredPlatforms.delete(Platform.POSTMAN);
      this.logger.warn(
        'Postman platform is disabled in production environment',
        { step: 'init' },
      );
    }

    this.minAppVersion = this.configService.get<string>(
      'MIN_APP_VERSION',
      '1.0.0',
    );
    this.appName = this.configService.get<string>('APP_NAME', '');

    if (this.apiKeyConfig.allKeys.size === 0) {
      this.logger.warn('No valid API keys configured', { step: 'init' });
    }
    if (this.clientIdConfig.allKeys.size === 0) {
      this.logger.warn('No valid Client IDs configured', { step: 'init' });
    }
    if (this.requiredPlatforms.size === 0) {
      this.logger.warn('No required platforms configured', { step: 'init' });
    }
  }

  /**
   * Validates custom client identity headers and the x-user-agent string against
   * configured whitelists and version thresholds.
   *
   * Can be bypassed by applying the `@SkipClientIdentity()` decorator to a route.
   * Successfully validated identity data is attached to `request.clientIdentity`.
   *
   * @returns `true` if all client identity headers and version constraints are satisfied.
   * @throws {UnauthorizedException} When the API key, Client ID, platform, or app version is invalid.
   * @throws {BadRequestException} When required headers are missing or malformed.
   */
  canActivate(context: ExecutionContext): boolean {
    const isSkipped = this.reflector.getAllAndOverride<boolean>(
      SKIP_CLIENT_IDENTITY_META,
      [context.getHandler(), context.getClass()],
    );

    if (isSkipped) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const headers = request.headers;

    const apiKey = headers['x-api-key'];
    if (!apiKey)
      throw new UnauthorizedException('x-api-key header is required');
    if (typeof apiKey !== 'string' || !this.apiKeyConfig.allKeys.has(apiKey)) {
      throw new UnauthorizedException('Invalid API Key');
    }

    const clientId = headers['x-client-id'];
    if (!clientId)
      throw new BadRequestException('x-client-id header is required');
    if (
      typeof clientId !== 'string' ||
      !this.clientIdConfig.allKeys.has(clientId)
    ) {
      throw new UnauthorizedException('Invalid Client ID');
    }

    const deviceId = headers['x-device-id'];
    if (!deviceId || typeof deviceId !== 'string') {
      throw new BadRequestException(
        'x-device-id header is required and must be a string',
      );
    }

    // Authoritatively resolve client platform from dedicated Client ID (and cross-validate with API Key)
    const clientPlatform = this.clientIdConfig.keyPlatformMap.get(clientId);
    const apiPlatform = this.apiKeyConfig.keyPlatformMap.get(apiKey);

    if (!clientPlatform) {
      throw new UnauthorizedException('Invalid Client ID platform assignment');
    }

    if (!apiPlatform) {
      throw new UnauthorizedException('Invalid API Key platform assignment');
    }

    if (clientPlatform !== apiPlatform) {
      throw new UnauthorizedException(
        `API Key platform (${apiPlatform}) does not match Client ID platform (${clientPlatform})`,
      );
    }

    if (!this.isPlatformAllowed(clientPlatform)) {
      throw new UnauthorizedException(
        `Invalid platform. Supported: ${Array.from(this.requiredPlatforms).join(', ')}`,
      );
    }

    const userAgent = UserAgentUtils.resolveCanonicalUserAgent(headers);

    if (!userAgent)
      throw new BadRequestException(
        'User-Agent or x-user-agent header is required',
      );

    const uaData = this.validateAndParseUserAgent(userAgent, clientPlatform);

    // Attach validated data strictly typed to the interface
    request.clientIdentity = {
      apiKey,
      clientId,
      deviceId,
      userAgent: uaData,
    };

    return true;
  }

  private validateAndParseUserAgent(
    userAgent: string,
    clientPlatform: Platform,
  ): UserAgentData {
    const regex = /^([^/]+)\/([^\s]+)\s+\(([^\s]+)\s+([^;]+);\s*([^)]+)\)$/;
    const match = userAgent.match(regex);

    // 1. Authoritative Web Platform: Accept browser, SSR (node/axios), or structured web placeholder
    if (clientPlatform === Platform.WEB) {
      if (match) {
        const [, parsedAppName, version, , osVersion, deviceModel] = match;
        return {
          appName: parsedAppName,
          version,
          platform: Platform.WEB,
          osVersion,
          deviceModel,
        };
      }
      return this.parseWebUserAgent(userAgent);
    }

    // 2. Authoritative Postman Platform: Accept PostmanRuntime or custom format
    if (clientPlatform === Platform.POSTMAN) {
      if (match) {
        const [, parsedAppName, version, , osVersion, deviceModel] = match;
        return {
          appName: parsedAppName,
          version,
          platform: Platform.POSTMAN,
          osVersion,
          deviceModel,
        };
      }
      return this.parsePostmanUserAgent(userAgent);
    }

    // 3. Authoritative Mobile Platforms (iOS & Android): Strictly require custom app user-agent
    if (!match) {
      throw new BadRequestException(
        `User-Agent format is invalid: expected ${this.appName || 'BreathAway'}/Version (${clientPlatform} OSVersion; DeviceModel)`,
      );
    }

    const [, parsedAppName, version, rawPlatform, osVersion, deviceModel] =
      match;
    const uaPlatform = this.normalizePlatformEnum(rawPlatform);

    if (
      this.appName &&
      parsedAppName.toLowerCase() !== this.appName.toLowerCase()
    ) {
      throw new UnauthorizedException(
        `User-Agent app name (${parsedAppName}) does not match expected app name (${this.appName})`,
      );
    }

    if (uaPlatform !== clientPlatform) {
      throw new UnauthorizedException(
        `User-Agent platform (${rawPlatform}) does not match Client ID platform (${clientPlatform})`,
      );
    }

    if (!this.isVersionValid(version)) {
      throw new UnauthorizedException(
        `App version must be at least ${this.minAppVersion}`,
      );
    }

    return {
      appName: parsedAppName,
      version,
      platform: clientPlatform,
      osVersion,
      deviceModel,
    };
  }

  private parseWebUserAgent(userAgent: string): UserAgentData {
    const parsedUa = new UAParser(userAgent).getResult();

    const osVersion =
      [parsedUa.os.name, parsedUa.os.version].filter(Boolean).join(' ') ||
      this.resolveFallbackOs(parsedUa, userAgent);

    const deviceModel = this.resolveBrowserDeviceModel(parsedUa, userAgent);

    return {
      appName: this.appName || 'BreathAway',
      version: '1.0.0',
      platform: Platform.WEB,
      osVersion,
      deviceModel,
    };
  }

  private parsePostmanUserAgent(userAgent: string): UserAgentData {
    const postmanMatch = userAgent.match(/PostmanRuntime\/([^\s]+)/i);
    const postmanVersion = postmanMatch ? postmanMatch[1] : '1.0.0';

    return {
      appName: this.appName || 'BreathAway',
      version: postmanVersion,
      platform: Platform.POSTMAN,
      osVersion: 'Postman',
      deviceModel: 'Postman Client',
    };
  }

  private resolveFallbackOs(
    result: UAParser.IResult,
    rawUserAgent: string,
  ): string {
    const parsedOs = [result.os.name, result.os.version]
      .filter(Boolean)
      .join(' ');
    if (parsedOs) return parsedOs;

    const lower = rawUserAgent.toLowerCase();
    if (lower.startsWith('node') || lower.includes('node/')) return 'Node.js';
    if (lower.includes('macintosh') || lower.includes('mac os')) return 'macOS';
    if (lower.includes('windows')) return 'Windows';
    if (lower.includes('linux')) return 'Linux';

    return 'Browser';
  }

  private resolveBrowserDeviceModel(
    result: UAParser.IResult,
    rawUserAgent?: string,
  ): string {
    const browserIdentifier = [result.browser.name, result.browser.version]
      .filter(Boolean)
      .join(' ');

    switch (result.device.type) {
      case 'tablet':
        return this.formatDeviceName(result.device, 'Tablet');
      case 'mobile':
        return this.formatDeviceName(result.device, 'Mobile');
      case 'smarttv':
        return this.formatDeviceName(result.device, 'SmartTV');
      case 'wearable':
        return this.formatDeviceName(result.device, 'Wearable');
      case 'console':
        return this.formatDeviceName(result.device, 'Console');
      default: {
        if (browserIdentifier) return browserIdentifier;
        if (result.device.model) return result.device.model;

        const lower = (rawUserAgent || '').toLowerCase();
        if (lower.startsWith('node') || lower.includes('node/')) {
          return 'Node.js Server';
        }

        return 'Desktop';
      }
    }
  }

  private formatDeviceName(
    device: { vendor?: string; model?: string },
    fallback: string,
  ): string {
    if (!device.model) return fallback;
    if (
      device.vendor &&
      !device.model.toLowerCase().startsWith(device.vendor.toLowerCase())
    ) {
      return `${device.vendor} ${device.model}`;
    }
    return device.model;
  }

  private isVersionValid(version: string): boolean {
    const [minMajor, minMinor, minPatch] = this.minAppVersion
      .split('.')
      .map(Number);
    const [appMajor, appMinor, appPatch] = version.split('.').map(Number);

    if (appMajor > minMajor) return true;
    if (appMajor === minMajor && appMinor > minMinor) return true;
    if (appMajor === minMajor && appMinor === minMinor && appPatch >= minPatch)
      return true;

    return false;
  }

  private isPlatformAllowed(platform: Platform | string): boolean {
    const platformLower = String(platform).toLowerCase().trim();
    if (platformLower === Platform.POSTMAN && this.isProductionEnvironment()) {
      return false;
    }
    return this.requiredPlatforms.has(platformLower);
  }

  private isProductionEnvironment(): boolean {
    const nodeEnv = this.configService
      .get<string>('NODE_ENV', '')
      .toLowerCase()
      .trim();
    const deploymentEnv = this.configService
      .get<string>('DEPLOYMENT_ENV', '')
      .toLowerCase()
      .trim();

    return nodeEnv === 'production' || deploymentEnv === 'production';
  }

  private normalizePlatformEnum(rawPlatform: string): Platform | undefined {
    const lower = rawPlatform.toLowerCase().trim();
    if (lower === (Platform.ANDROID as string)) return Platform.ANDROID;
    if (lower === (Platform.IOS as string)) return Platform.IOS;
    if (lower === (Platform.WEB as string)) return Platform.WEB;
    if (lower === (Platform.POSTMAN as string)) return Platform.POSTMAN;
    return undefined;
  }

  private parsePlatformKeyedConfig(
    envKey: string,
    fallback: string,
  ): PlatformKeyConfig {
    const rawValue = this.configService.get<string>(envKey, fallback);
    const allKeys = new Set<string>();
    const keyPlatformMap = new Map<string, Platform>();

    try {
      const trimmed = (rawValue || '').trim();
      const unquoted = trimmed.replace(/^['"]|['"]$/g, '').trim();
      const parsed = JSON.parse(unquoted || fallback) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(
          'Config must be a JSON object mapping platform names to arrays of keys',
        );
      }

      let foundValidPlatform = false;
      for (const [platformKey, platformKeys] of Object.entries(parsed)) {
        const normalizedPlatform = this.normalizePlatformEnum(platformKey);
        if (normalizedPlatform && Array.isArray(platformKeys)) {
          foundValidPlatform = true;
          for (const item of platformKeys) {
            const key = String(item).trim();
            if (key) {
              if (keyPlatformMap.has(key)) {
                this.logger.warn(
                  'Duplicate key detected across multiple platforms in configuration',
                  {
                    envKey,
                    keyMasked: `${key.slice(0, 4)}...`,
                    existingPlatform: keyPlatformMap.get(key),
                    duplicatePlatform: normalizedPlatform,
                    step: 'parse_config',
                  },
                );
              } else {
                allKeys.add(key);
                keyPlatformMap.set(key, normalizedPlatform);
              }
            }
          }
        }
      }

      if (!foundValidPlatform) {
        throw new Error(
          'Config object does not contain any valid platform keys (expected android, ios, web, or postman)',
        );
      }

      return { allKeys, keyPlatformMap };
    } catch {
      this.logger.error(
        'Failed to parse config as platform-keyed JSON object',
        {
          envKey,
          step: 'parse_config',
        },
      );
      return { allKeys, keyPlatformMap };
    }
  }

  private parsePlatformSet(envKey: string, fallback: string): Set<string> {
    const rawValue = this.configService.get<string>(envKey, fallback);
    if (!rawValue || typeof rawValue !== 'string') {
      return new Set();
    }

    const trimmed = rawValue.trim();
    const unquoted = trimmed.replace(/^['"]|['"]$/g, '').trim();

    try {
      const parsed = JSON.parse(unquoted) as unknown[];
      if (Array.isArray(parsed)) {
        return new Set(
          parsed
            .map((item) => String(item).toLowerCase().trim())
            .filter(Boolean),
        );
      }
    } catch {
      // Fallback for non-JSON formatted lists like [ios,android,web,postman] or ios,android,web,postman
      const unbracketed = unquoted.replace(/^\[|\]$/g, '').trim();
      if (unbracketed) {
        const items = unbracketed
          .split(',')
          .map((item) =>
            item
              .replace(/^['"]|['"]$/g, '')
              .toLowerCase()
              .trim(),
          )
          .filter(Boolean);
        if (items.length > 0) {
          return new Set(items);
        }
      }

      this.logger.error('Failed to parse config as JSON array', {
        envKey,
        step: 'parse_config',
      });
    }

    return new Set();
  }
}
