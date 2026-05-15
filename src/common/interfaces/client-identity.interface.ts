export interface UserAgentData {
  appName: string;
  version: string;
  platform: Platform;
  osVersion: string;
  deviceModel: string;
}

export interface ClientIdentityData {
  apiKey: string;
  clientId: string;
  deviceId: string;
  userAgent: UserAgentData;
}

export enum Platform {
  ANDROID = 'android',
  IOS = 'ios',
}
