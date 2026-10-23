import { Platform, UserAgentData } from '@common/interfaces';
import { UserAgentUtils } from '@common/utils/user-agent.utils';

describe('UserAgentUtils', () => {
  const iosAgent: UserAgentData = {
    appName: 'BreathAway',
    platform: Platform.IOS,
    version: '2.4.1',
    osVersion: '17.2',
    deviceModel: 'iPhone 15 Pro',
  };

  const androidAgent: UserAgentData = {
    appName: 'BreathAway',
    platform: Platform.ANDROID,
    version: '1.10.5',
    osVersion: '14',
    deviceModel: 'Pixel 8',
  };

  describe('isiOS', () => {
    it('should return true for iOS platform and false for Android', () => {
      expect(UserAgentUtils.isiOS(iosAgent)).toBe(true);
      expect(UserAgentUtils.isiOS(androidAgent)).toBe(false);
    });
  });

  describe('isAndroid', () => {
    it('should return true for Android platform and false for iOS', () => {
      expect(UserAgentUtils.isAndroid(androidAgent)).toBe(true);
      expect(UserAgentUtils.isAndroid(iosAgent)).toBe(false);
    });
  });

  describe('isMinimumVersion', () => {
    it('should return true when app major version is greater than minimum', () => {
      expect(UserAgentUtils.isMinimumVersion(iosAgent, '1.9.9')).toBe(true);
    });

    it('should return true when app minor version is greater than minimum with equal major', () => {
      expect(UserAgentUtils.isMinimumVersion(iosAgent, '2.3.9')).toBe(true);
    });

    it('should return true when app patch version is greater than or equal to minimum with equal major and minor', () => {
      expect(UserAgentUtils.isMinimumVersion(iosAgent, '2.4.1')).toBe(true);
      expect(UserAgentUtils.isMinimumVersion(iosAgent, '2.4.0')).toBe(true);
    });

    it('should return false when app version is lower than minimum', () => {
      expect(UserAgentUtils.isMinimumVersion(iosAgent, '3.0.0')).toBe(false);
      expect(UserAgentUtils.isMinimumVersion(iosAgent, '2.5.0')).toBe(false);
      expect(UserAgentUtils.isMinimumVersion(iosAgent, '2.4.2')).toBe(false);
    });
  });

  describe('getMajorVersion', () => {
    it('should return the parsed major version integer', () => {
      expect(UserAgentUtils.getMajorVersion(iosAgent)).toBe(2);
      expect(UserAgentUtils.getMajorVersion(androidAgent)).toBe(1);
    });
  });

  describe('isSyntheticWebUserAgent', () => {
    it('should return true for generic web placeholder user-agents', () => {
      expect(
        UserAgentUtils.isSyntheticWebUserAgent(
          'BreathAway/1.0.0 (Web 1.0; Browser)',
        ),
      ).toBe(true);
      expect(
        UserAgentUtils.isSyntheticWebUserAgent(
          'BreathAway/2.0.0 (web macOS; Browser)',
        ),
      ).toBe(true);
    });

    it('should return false for native mobile app user-agents', () => {
      expect(
        UserAgentUtils.isSyntheticWebUserAgent(
          'BreathAway/1.2.0 (iOS 17.5; iPhone15,2)',
        ),
      ).toBe(false);
      expect(
        UserAgentUtils.isSyntheticWebUserAgent(
          'BreathAway/2.0.1 (Android 14; Pixel8)',
        ),
      ).toBe(false);
    });

    it('should return false for standard browser user-agents', () => {
      expect(
        UserAgentUtils.isSyntheticWebUserAgent(
          'Mozilla/5.0 (Linux; Android 16; Pixel 10) Chrome/155.0.0.0',
        ),
      ).toBe(false);
      expect(
        UserAgentUtils.isSyntheticWebUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ),
      ).toBe(false);
    });

    it('should return false for null, undefined, or empty values', () => {
      expect(UserAgentUtils.isSyntheticWebUserAgent(null)).toBe(false);
      expect(UserAgentUtils.isSyntheticWebUserAgent(undefined)).toBe(false);
      expect(UserAgentUtils.isSyntheticWebUserAgent('')).toBe(false);
    });
  });

  describe('resolveCanonicalUserAgent', () => {
    it('should prioritize native mobile x-user-agent over standard user-agent', () => {
      const headers = {
        'x-user-agent': 'BreathAway/1.2.0 (iOS 17.5; iPhone15,2)',
        'user-agent': 'CFNetwork/1498 Darwin/23.5.0',
      };
      expect(UserAgentUtils.resolveCanonicalUserAgent(headers)).toBe(
        'BreathAway/1.2.0 (iOS 17.5; iPhone15,2)',
      );
    });

    it('should prioritize standard user-agent when x-user-agent is a synthetic web placeholder', () => {
      const headers = {
        'x-user-agent': 'BreathAway/1.0.0 (Web 1.0; Browser)',
        'user-agent':
          'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
      };
      expect(UserAgentUtils.resolveCanonicalUserAgent(headers)).toBe(
        'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
      );
    });

    it('should fallback to synthetic x-user-agent when standard user-agent is absent', () => {
      const headers = {
        'x-user-agent': 'BreathAway/1.0.0 (Web 1.0; Browser)',
      };
      expect(UserAgentUtils.resolveCanonicalUserAgent(headers)).toBe(
        'BreathAway/1.0.0 (Web 1.0; Browser)',
      );
    });

    it('should return standard user-agent when x-user-agent is omitted', () => {
      const headers = {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0',
      };
      expect(UserAgentUtils.resolveCanonicalUserAgent(headers)).toBe(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0',
      );
    });

    it('should handle array header values properly', () => {
      const headers = {
        'x-user-agent': ['BreathAway/2.0.0 (Android 14; Pixel8)'],
      };
      expect(UserAgentUtils.resolveCanonicalUserAgent(headers)).toBe(
        'BreathAway/2.0.0 (Android 14; Pixel8)',
      );
    });

    it('should return undefined when no headers or headers map is undefined', () => {
      expect(UserAgentUtils.resolveCanonicalUserAgent({})).toBeUndefined();
      expect(
        UserAgentUtils.resolveCanonicalUserAgent(undefined),
      ).toBeUndefined();
    });
  });
});
