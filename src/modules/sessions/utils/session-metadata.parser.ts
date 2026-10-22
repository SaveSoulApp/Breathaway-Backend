import { DevicePlatform } from '@prisma/client';
import { UAParser } from 'ua-parser-js';

export interface ParsedSessionMetadata {
  platform: DevicePlatform;
  deviceModel: string | null;
  os: string | null;
  browser: string | null;
  appVersion: string | null;
}

/**
 * Utility for parsing client User-Agent strings into structured device, OS, and browser metadata.
 *
 * Supports both:
 * 1. BreathAway custom app User-Agent format: `AppName/Version (Platform OSVersion; DeviceModel)`
 * 2. Standard browser User-Agent strings (Chrome, Safari, Firefox, Edge).
 */
export class SessionMetadataParser {
  private static readonly CUSTOM_UA_REGEX =
    /^([^/]+)\/([^\s]+)\s+\(([^\s]+)\s+([^;]+);\s*([^)]+)\)$/;

  /**
   * Parses an arbitrary User-Agent string into structured session metadata.
   *
   * @param userAgent - Raw User-Agent header string.
   * @returns Structured session metadata with normalized platform, model, OS, and browser.
   */
  static parse(userAgent?: string | null): ParsedSessionMetadata {
    if (
      !userAgent ||
      typeof userAgent !== 'string' ||
      userAgent.trim() === ''
    ) {
      return {
        platform: DevicePlatform.WEB,
        deviceModel: null,
        os: null,
        browser: null,
        appVersion: null,
      };
    }

    const trimmed = userAgent.trim();

    // 1. Try custom mobile/web client format
    const match = trimmed.match(this.CUSTOM_UA_REGEX);
    if (match) {
      const [, , version, rawPlatform, osVersion, deviceModel] = match;

      return {
        platform: this.normalizePlatform(rawPlatform),
        deviceModel: deviceModel.trim() || null,
        os: `${rawPlatform} ${osVersion}`.trim() || null,
        browser: rawPlatform.toLowerCase() === 'web' ? 'Browser' : null,
        appVersion: version.trim() || null,
      };
    }

    // 2. Fall back to standard browser User-Agent parsing
    const parsed = new UAParser(trimmed).getResult();

    const rawOs = [parsed.os.name, parsed.os.version]
      .filter(Boolean)
      .join(' ')
      .trim();

    const rawBrowser = [parsed.browser.name, parsed.browser.version]
      .filter(Boolean)
      .join(' ')
      .trim();

    const rawModel =
      [parsed.device.vendor, parsed.device.model]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      parsed.os.name ||
      null;

    let platform: DevicePlatform = DevicePlatform.WEB;
    const osNameLower = (parsed.os.name || '').toLowerCase();
    if (
      osNameLower.includes('ios') ||
      osNameLower.includes('iphone') ||
      osNameLower.includes('ipad')
    ) {
      platform = DevicePlatform.IOS;
    } else if (osNameLower.includes('android')) {
      platform = DevicePlatform.ANDROID;
    }

    return {
      platform,
      deviceModel: rawModel,
      os: rawOs || null,
      browser: rawBrowser || null,
      appVersion: null,
    };
  }

  /**
   * Maps raw platform string to Prisma DevicePlatform enum.
   */
  private static normalizePlatform(rawPlatform: string): DevicePlatform {
    const lower = rawPlatform.toLowerCase();
    if (lower === 'ios') return DevicePlatform.IOS;
    if (lower === 'android') return DevicePlatform.ANDROID;
    return DevicePlatform.WEB;
  }
}
