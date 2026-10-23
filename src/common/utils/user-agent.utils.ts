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

  /**
   * Determines whether a user agent string is a generic web placeholder
   * (e.g. "BreathAway/1.0.0 (Web 1.0; Browser)" or contains platform "Web" with "Browser").
   */
  static isSyntheticWebUserAgent(ua?: string | null): boolean {
    if (!ua || typeof ua !== 'string') return false;
    const lower = ua.toLowerCase();
    return (
      lower.includes('(web') &&
      (lower.includes('browser') || lower.includes('web 1.0'))
    );
  }

  /**
   * Resolves the canonical user agent from incoming request headers.
   *
   * 1. If `x-user-agent` is present and represents a native mobile application (iOS/Android),
   *    prioritizes `x-user-agent` to preserve app versioning and device model.
   * 2. If `x-user-agent` is a generic web placeholder or omitted, and standard `user-agent`
   *    is available, prioritizes standard `user-agent` to capture rich hardware, OS, and browser details.
   * 3. Falls back to whichever header is available.
   *
   * @param headers - Incoming HTTP request headers map.
   * @returns Canonical user agent string, or undefined if neither is present.
   */
  static resolveCanonicalUserAgent(
    headers?: Record<string, string | string[] | undefined>,
  ): string | undefined {
    if (!headers) return undefined;

    const rawXUserAgent = headers['x-user-agent'];
    const xUserAgent = Array.isArray(rawXUserAgent)
      ? rawXUserAgent[0]?.trim()
      : typeof rawXUserAgent === 'string'
        ? rawXUserAgent.trim()
        : undefined;

    const rawStandardUserAgent = headers['user-agent'];
    const standardUserAgent = Array.isArray(rawStandardUserAgent)
      ? rawStandardUserAgent[0]?.trim()
      : typeof rawStandardUserAgent === 'string'
        ? rawStandardUserAgent.trim()
        : undefined;

    // If x-user-agent is the synthetic web placeholder and standard user-agent is available, prefer standard
    if (
      xUserAgent &&
      this.isSyntheticWebUserAgent(xUserAgent) &&
      standardUserAgent &&
      standardUserAgent.length > 0
    ) {
      return standardUserAgent;
    }

    // Otherwise prioritize x-user-agent (native mobile apps)
    if (xUserAgent && xUserAgent.length > 0) {
      return xUserAgent;
    }

    return standardUserAgent && standardUserAgent.length > 0
      ? standardUserAgent
      : undefined;
  }
}
