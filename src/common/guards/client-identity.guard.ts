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

import {
  Platform,
  UserAgentData,
} from '../interfaces/client-identity.interface';

export const SKIP_CLIENT_IDENTITY_META = 'skipClientIdentity';

/**
 * Restricts access based on strict client identity verification, enforcing API keys,
 * client IDs, and required platform/version constraints.
 *
 * Ensures that incoming requests originate from a supported, up-to-date client application
 * and extracts validated identity metadata into the request object.
 */
@Injectable()
export class ClientIdentityGuard implements CanActivate {
  private readonly validApiKeys: Set<string>;
  private readonly validClientIds: Set<string>;
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
    this.validApiKeys = this.parseJsonConfig('API_KEYS', '[]');
    this.validClientIds = this.parseJsonConfig('CLIENT_IDS', '[]');
    this.requiredPlatforms = this.parseJsonConfig('REQUIRED_PLATFORMS', '[]');
    this.minAppVersion = this.configService.get<string>(
      'MIN_APP_VERSION',
      '1.0.0',
    );
    this.appName = this.configService.get<string>('APP_NAME', '');

    if (this.validApiKeys.size === 0) {
      this.logger.warn('No valid API keys configured', { step: 'init' });
    }
    if (this.validClientIds.size === 0) {
      this.logger.warn('No valid Client IDs configured', { step: 'init' });
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
    if (typeof apiKey !== 'string' || !this.validApiKeys.has(apiKey)) {
      throw new UnauthorizedException('Invalid API Key');
    }

    const clientId = headers['x-client-id'];
    if (!clientId)
      throw new BadRequestException('x-client-id header is required');
    if (typeof clientId !== 'string' || !this.validClientIds.has(clientId)) {
      throw new UnauthorizedException('Invalid Client ID');
    }

    const deviceId = headers['x-device-id'];
    if (!deviceId || typeof deviceId !== 'string') {
      throw new BadRequestException(
        'x-device-id header is required and must be a string',
      );
    }

    const userAgentHeader = headers['x-user-agent'];
    const standardUserAgent = headers['user-agent'];

    const userAgent =
      typeof userAgentHeader === 'string' && userAgentHeader.trim().length > 0
        ? userAgentHeader
        : typeof standardUserAgent === 'string' &&
            standardUserAgent.trim().length > 0
          ? standardUserAgent
          : undefined;

    if (!userAgent)
      throw new BadRequestException('x-user-agent header is required');

    const uaData = this.validateAndParseUserAgent(userAgent);

    // Attach validated data strictly typed to the interface
    request.clientIdentity = {
      apiKey,
      clientId,
      deviceId,
      userAgent: uaData,
    };

    return true;
  }

  private validateAndParseUserAgent(userAgent: string): UserAgentData {
    const regex = /^([^/]+)\/([^\s]+)\s+\(([^\s]+)\s+([^;]+);\s*([^)]+)\)$/;
    const match = userAgent.match(regex);

    if (match) {
      const [, parsedAppName, version, platform, osVersion, deviceModel] =
        match;

      const matchingPlatform = Array.from(this.requiredPlatforms).find(
        (p) => p.toLowerCase() === platform.toLowerCase(),
      );

      if (!matchingPlatform) {
        throw new UnauthorizedException(
          `Invalid platform. Supported: ${Array.from(this.requiredPlatforms).join(', ')}`,
        );
      }

      const isWeb = (platform.toLowerCase() as Platform) === Platform.WEB;
      if (!isWeb && !this.isVersionValid(version)) {
        throw new UnauthorizedException(
          `App version must be at least ${this.minAppVersion}`,
        );
      }

      return {
        appName: parsedAppName,
        version,
        platform: platform.toLowerCase() as Platform,
        osVersion,
        deviceModel,
      };
    }

    // Fallback: Support standard browser User-Agent strings for web clients
    const parsedUa = new UAParser(userAgent).getResult();
    if (parsedUa.browser.name || parsedUa.os.name) {
      return this.parseBrowserUserAgent(parsedUa);
    }

    throw new BadRequestException(
      `x-user-agent must follow format: ${this.appName}/Version (Platform OSVersion; DeviceModel)`,
    );
  }

  private parseBrowserUserAgent(result: UAParser.IResult): UserAgentData {
    const matchingPlatform = Array.from(this.requiredPlatforms).find(
      (p) => p.toLowerCase() === (Platform.WEB as string),
    );

    if (!matchingPlatform) {
      throw new UnauthorizedException(
        `Invalid platform. Supported: ${Array.from(this.requiredPlatforms).join(', ')}`,
      );
    }

    const osVersion =
      [result.os.name, result.os.version].filter(Boolean).join(' ') ||
      'Browser';

    const deviceModel = this.resolveBrowserDeviceModel(result);

    return {
      appName: this.appName || 'BreathAway',
      version: '1.0.0',
      platform: Platform.WEB,
      osVersion,
      deviceModel,
    };
  }

  private resolveBrowserDeviceModel(result: UAParser.IResult): string {
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
      default:
        return browserIdentifier || result.device.model || 'Desktop';
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

  private parseJsonConfig(envKey: string, fallback: string): Set<string> {
    const value = this.configService.get<string>(envKey, fallback);
    try {
      const parsed = JSON.parse(value) as unknown[];
      if (!Array.isArray(parsed)) throw new Error();
      return new Set(parsed.map((item) => String(item).trim()).filter(Boolean));
    } catch {
      this.logger.error('Failed to parse config as JSON array', {
        envKey,
        step: 'parse_config',
      });
      return new Set();
    }
  }
}
