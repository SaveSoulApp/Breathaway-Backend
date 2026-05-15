export interface UserAgentData {
  appName: string;
  version: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
}

export interface ClientIdentityData {
  apiKey: string;
  clientId: string;
  deviceId: string;
  userAgent: UserAgentData;
}