import { DevicePlatform } from '@prisma/client';

export const DEVICE_ADDED_EVENT = 'device.added';

export class DeviceAddedEvent {
  constructor(
    public readonly userId: string,
    public readonly platform: DevicePlatform,
    public readonly deviceId: string | null = null,
    public readonly appVersion: string | null = null,
  ) {}
}
