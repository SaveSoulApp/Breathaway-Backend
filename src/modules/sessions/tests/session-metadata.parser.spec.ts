import { DevicePlatform } from '@prisma/client';

import { SessionMetadataParser } from '../utils/session-metadata.parser';

describe('SessionMetadataParser', () => {
  describe('Custom App User-Agent format', () => {
    it('should parse custom iOS app User-Agent correctly', () => {
      const ua = 'BreathAway/1.2.0 (iOS 17.5; iPhone15,2)';
      const result = SessionMetadataParser.parse(ua);

      expect(result).toEqual({
        platform: DevicePlatform.IOS,
        deviceModel: 'iPhone15,2',
        os: 'iOS 17.5',
        browser: null,
        appVersion: '1.2.0',
      });
    });

    it('should parse custom Android app User-Agent correctly', () => {
      const ua = 'BreathAway/2.0.1 (Android 14; SM-S928B)';
      const result = SessionMetadataParser.parse(ua);

      expect(result).toEqual({
        platform: DevicePlatform.ANDROID,
        deviceModel: 'SM-S928B',
        os: 'Android 14',
        browser: null,
        appVersion: '2.0.1',
      });
    });

    it('should parse custom Web client User-Agent correctly', () => {
      const ua = 'BreathAway/1.0.0 (Web 1.0; Browser)';
      const result = SessionMetadataParser.parse(ua);

      expect(result).toEqual({
        platform: DevicePlatform.WEB,
        deviceModel: 'Web Browser',
        os: 'Web',
        browser: 'Web Browser',
        appVersion: '1.0.0',
      });
    });
  });

  describe('Standard Browser User-Agent format', () => {
    it('should parse Chrome on macOS User-Agent', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      const result = SessionMetadataParser.parse(ua);

      expect(result.platform).toBe(DevicePlatform.WEB);
      expect(result.browser).toContain('Chrome');
      expect(result.os).toContain('macOS');
      expect(result.deviceModel).toBe('Apple Macintosh');
    });

    it('should parse Safari on iPhone User-Agent as WEB platform', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
      const result = SessionMetadataParser.parse(ua);

      expect(result.platform).toBe(DevicePlatform.WEB);
      expect(result.deviceModel).toBe('Apple iPhone');
      expect(result.os).toContain('iOS');
      expect(result.browser).toContain('Safari');
    });

    it('should parse Chrome on Android mobile User-Agent as WEB platform', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
      const result = SessionMetadataParser.parse(ua);

      expect(result.platform).toBe(DevicePlatform.WEB);
      expect(result.os).toContain('Android');
      expect(result.browser).toContain('Chrome');
      expect(result.deviceModel).toBe('Samsung SM-S928B');
    });

    it('should parse Chrome on Pixel 10 Android User-Agent with vendor and model as WEB platform', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
      const result = SessionMetadataParser.parse(ua);

      expect(result.platform).toBe(DevicePlatform.WEB);
      expect(result.deviceModel).toBe('Google Pixel 10');
      expect(result.os).toBe('Android 16');
      expect(result.browser).toBe('Mobile Chrome 155.0.0.0');
    });
  });

  describe('Edge cases', () => {
    it('should handle null or undefined safely', () => {
      const resNull = SessionMetadataParser.parse(null);
      expect(resNull).toEqual({
        platform: DevicePlatform.WEB,
        deviceModel: null,
        os: null,
        browser: null,
        appVersion: null,
      });

      const resUndef = SessionMetadataParser.parse(undefined);
      expect(resUndef).toEqual({
        platform: DevicePlatform.WEB,
        deviceModel: null,
        os: null,
        browser: null,
        appVersion: null,
      });
    });

    it('should handle empty or whitespace string', () => {
      const resEmpty = SessionMetadataParser.parse('   ');
      expect(resEmpty).toEqual({
        platform: DevicePlatform.WEB,
        deviceModel: null,
        os: null,
        browser: null,
        appVersion: null,
      });
    });
  });
});
