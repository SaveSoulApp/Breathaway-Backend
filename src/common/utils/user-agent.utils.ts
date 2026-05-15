import { Platform, UserAgentData } from '@common/interfaces';

export class UserAgentUtils {
  static isiOS(userAgentData: UserAgentData): boolean {
    return userAgentData.platform === Platform.IOS;
  }

  static isAndroid(userAgentData: UserAgentData): boolean {
    return userAgentData.platform === Platform.ANDROID;
  }

  static isMinimumVersion(
    userAgentData: UserAgentData,
    minVersion: string,
  ): boolean {
    const [minMajor, minMinor, minPatch] = minVersion.split('.').map(Number);
    const [appMajor, appMinor, appPatch] = userAgentData.version
      .split('.')
      .map(Number);

    if (appMajor > minMajor) return true;
    if (appMajor === minMajor && appMinor > minMinor) return true;
    if (appMajor === minMajor && appMinor === minMinor && appPatch >= minPatch)
      return true;

    return false;
  }

  static getMajorVersion(userAgentData: UserAgentData): number {
    return parseInt(userAgentData.version.split('.')[0], 10);
  }
}
