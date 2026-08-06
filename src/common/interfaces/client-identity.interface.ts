/**
 * Extracted and validated device metadata from the x-user-agent string.
 */
export interface UserAgentData {
  appName: string;
  version: string;
  platform: Platform;
  osVersion: string;
  deviceModel: string;
}

/**
 * Validated client identity metadata attached to the request by ClientIdentityGuard.
 */
export interface ClientIdentityData {
  apiKey: string;
  clientId: string;
  deviceId: string;
  userAgent: UserAgentData;
}

/**
 * Supported mobile operating systems.
 */
export enum Platform {
  ANDROID = 'android',
  IOS = 'ios',
}
