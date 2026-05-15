import {
  Inject,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { Platform, UserAgentData } from '@common/interfaces';

@Injectable()
export class UserAgentMiddleware implements NestMiddleware {
  private appName: string;
  private requiredPlatforms: Set<string>;
  private minAppVersion: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    this.initializeMiddleware();
  }

  private initializeMiddleware() {
    this.appName = this.configService.get<string>('APP_NAME', 'BreathAway');

    const platformsValue = this.configService.get<string>(
      'REQUIRED_PLATFORMS',
      '["iOS","Android"]',
    );

    let platforms: string[];

    try {
      platforms = JSON.parse(platformsValue);

      if (!Array.isArray(platforms)) {
        throw new Error('REQUIRED_PLATFORMS must be a JSON array');
      }
    } catch (error) {
      // Fallback: comma-separated string
      platforms = platformsValue.split(',').map((p) => p.trim());
    }

    this.requiredPlatforms = new Set(
      platforms.filter((platform) => platform.length > 0),
    );

    if (this.requiredPlatforms.size === 0) {
      throw new Error('No valid platforms configured');
    }

    this.minAppVersion = this.configService.get<string>(
      'MIN_APP_VERSION',
      '1.0.0',
    );
  }

  use(req: Request, res: Response, next: NextFunction) {
    const userAgent = req.headers['user-agent'];

    if (!userAgent) {
      throw new UnauthorizedException('User-Agent header is required');
    }

    if (typeof userAgent !== 'string') {
      throw new UnauthorizedException('User-Agent header must be a string');
    }

    if (!this.isValidUserAgentFormat(userAgent)) {
      throw new UnauthorizedException(
        `User-Agent must follow format: ${this.appName}/Version (Platform OSVersion; DeviceModel)`,
      );
    }

    if (!this.isValidPlatform(userAgent)) {
      throw new UnauthorizedException(
        `Invalid platform. Supported platforms: ${Array.from(this.requiredPlatforms).join(', ')}`,
      );
    }

    if (!this.isValidVersion(userAgent)) {
      throw new UnauthorizedException(
        `App version must be at least ${this.minAppVersion}`,
      );
    }

    // Store the parsed user agent data for use in controllers
    req['userAgentData'] = this.parseUserAgent(userAgent);

    next();
  }

  private isValidUserAgentFormat(userAgent: string): boolean {
    // Expected format: AppName/Version (Platform OSVersion; DeviceModel)
    const regex = /^([^\/]+)\/([^\s]+)\s+\(([^\s]+)\s+([^;]+);\s*([^)]+)\)$/;
    return regex.test(userAgent);
  }

  private isValidPlatform(userAgent: string): boolean {
    const platform = this.extractPlatform(userAgent);
    return this.requiredPlatforms.has(platform);
  }

  private isValidVersion(userAgent: string): boolean {
    const version = this.extractVersion(userAgent);

    // Simple semantic version comparison
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

  private extractPlatform(userAgent: string): string {
    const match = userAgent.match(/\(([^\s]+)\s/);
    return match ? match[1] : '';
  }

  private extractVersion(userAgent: string): string {
    const match = userAgent.match(/\/([^\s]+)\s/);
    return match ? match[1] : '';
  }

  private parseUserAgent(userAgent: string): UserAgentData {
    const regex = /^([^\/]+)\/([^\s]+)\s+\(([^\s]+)\s+([^;]+);\s*([^)]+)\)$/;
    const match = userAgent.match(regex);

    if (!match) {
      throw new UnauthorizedException('Invalid User-Agent format');
    }

    return {
      appName: match[1],
      version: match[2],
      platform: match[3] as Platform,
      osVersion: match[4],
      deviceModel: match[5],
    };
  }
}
