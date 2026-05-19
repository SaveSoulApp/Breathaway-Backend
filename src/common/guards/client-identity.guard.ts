import { LoggerService } from '@core/logger';
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
import {
  Platform,
  UserAgentData,
} from '../interfaces/client-identity.interface';

export const SKIP_CLIENT_IDENTITY_META = 'skipClientIdentity';

@Injectable()
export class ClientIdentityGuard implements CanActivate {
  private readonly validApiKeys: Set<string>;
  private readonly validClientIds: Set<string>;
  private readonly requiredPlatforms: Set<string>;
  private readonly minAppVersion: string;
  private readonly appName: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.validApiKeys = this.parseJsonConfig('API_KEYS', '[]');
    this.validClientIds = this.parseJsonConfig('CLIENT_IDS', '[]');
    this.requiredPlatforms = this.parseJsonConfig('REQUIRED_PLATFORMS', '[]');
    this.minAppVersion = this.configService.get<string>(
      'MIN_APP_VERSION',
      '1.0.0',
    );
    this.appName = this.configService.get<string>('APP_NAME', '');

    if (this.validApiKeys.size === 0)
      this.logger.warn('No valid API keys configured.');
    if (this.validClientIds.size === 0)
      this.logger.warn('No valid Client IDs configured.');
  }

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

    const userAgent = headers['user-agent'];
    if (!userAgent)
      throw new BadRequestException('User-Agent header is required');

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

    if (!match) {
      throw new BadRequestException(
        `User-Agent must follow format: ${this.appName}/Version (Platform OSVersion; DeviceModel)`,
      );
    }

    const [, parsedAppName, version, platform, osVersion, deviceModel] = match;

    if (!this.requiredPlatforms.has(platform)) {
      throw new UnauthorizedException(
        `Invalid platform. Supported: ${Array.from(this.requiredPlatforms).join(', ')}`,
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
      platform: platform.toLowerCase() as Platform,
      osVersion,
      deviceModel,
    };
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
      this.logger.error(
        `Failed to parse ${envKey} as JSON array. Check your environment variables.`,
      );
      return new Set();
    }
  }
}
