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

      const isWebPlaceholder =
        rawPlatform.toLowerCase() === 'web' &&
        (deviceModel.trim().toLowerCase() === 'browser' ||
          deviceModel.trim() === '');

      return {
        platform: this.normalizePlatform(rawPlatform),
        deviceModel: isWebPlaceholder
          ? 'Web Browser'
          : deviceModel.trim() || null,
        os: isWebPlaceholder
          ? 'Web'
          : `${rawPlatform} ${osVersion}`.trim() || null,
        browser: rawPlatform.toLowerCase() === 'web' ? 'Web Browser' : null,
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

    const rawModel = this.resolveDeviceModel(parsed);

    // Standard browser requests represent web application sessions regardless of mobile or desktop OS
    return {
      platform: DevicePlatform.WEB,
      deviceModel: rawModel,
      os: rawOs || null,
      browser: rawBrowser || null,
      appVersion: null,
    };
  }

  /**
   * Resolves a clean hardware device model from UAParser result.
   */
  private static resolveDeviceModel(result: UAParser.IResult): string | null {
    const { vendor, model } = result.device;
    if (vendor && model) {
      if (model.toLowerCase().startsWith(vendor.toLowerCase())) {
        return model;
      }
      return `${vendor} ${model}`;
    }
    if (model) {
      return model;
    }
    if (result.os.name) {
      const osLower = result.os.name.toLowerCase();
      if (osLower.includes('mac')) return 'Macintosh';
      if (osLower.includes('windows')) return 'Windows';
      if (osLower.includes('linux')) return 'Linux';
      return result.os.name;
    }
    return null;
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
