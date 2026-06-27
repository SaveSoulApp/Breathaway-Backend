import { Platform, UserAgentData } from '@common/interfaces';

/**
 * Provides utility methods for parsing and validating client user agent data.
 *
 * Used primarily for enforcing minimum app version requirements and tailoring platform-specific behaviors.
 */
export class UserAgentUtils {
  /**
   * Determines if the requesting client is operating on an iOS device.
   *
   * @param userAgentData - The structured client platform and version payload.
   * @returns `true` if the platform is iOS; `false` otherwise.
   */
  static isiOS(userAgentData: UserAgentData): boolean {
    return userAgentData.platform === Platform.IOS;
  }

  /**
   * Determines if the requesting client is operating on an Android device.
   *
   * @param userAgentData - The structured client platform and version payload.
   * @returns `true` if the platform is Android; `false` otherwise.
   */
  static isAndroid(userAgentData: UserAgentData): boolean {
    return userAgentData.platform === Platform.ANDROID;
  }

  /**
   * Evaluates whether the client's app version meets or exceeds a specified minimum semantic version.
   *
   * @param userAgentData - The structured client platform and version payload.
   * @param minVersion - The semantic version string to compare against (e.g., "1.2.0").
   * @returns `true` if the client version is greater than or equal to the minimum version.
   */
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

  /**
   * Extracts the major version number from the client's app version string.
   *
   * @param userAgentData - The structured client platform and version payload.
   * @returns The parsed integer representing the major version.
   */
  static getMajorVersion(userAgentData: UserAgentData): number {
    return parseInt(userAgentData.version.split('.')[0], 10);
  }
}
