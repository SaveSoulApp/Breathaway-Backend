export interface UserAgentData {
  appName: string;
  version: string;
  platform: Platform;
  osVersion: string;
  deviceModel: string;
}

export enum Platform {
  IOS = 'iOS',
  ANDROID = 'Android',
  WEB = 'Web',
  POSTMAN = 'Postman',
}
