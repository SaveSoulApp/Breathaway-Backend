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
});
