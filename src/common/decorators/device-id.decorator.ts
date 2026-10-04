import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Extracts the client physical device identifier from the incoming HTTP request.
 *
 * Checks `request.clientIdentity?.deviceId` first (validated by ClientIdentityGuard),
 * then falls back to the `x-device-id` request header.
 *
 * @returns The resolved device ID string, or `undefined` if not present.
 */
export const DeviceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const identityDeviceId = request.clientIdentity?.deviceId;
    if (
      typeof identityDeviceId === 'string' &&
      identityDeviceId.trim().length > 0
    ) {
      return identityDeviceId.trim();
    }

    const headerDeviceId = request.headers['x-device-id'];
    if (
      typeof headerDeviceId === 'string' &&
      headerDeviceId.trim().length > 0
    ) {
      return headerDeviceId.trim();
    }
    if (Array.isArray(headerDeviceId) && headerDeviceId.length > 0) {
      const first = headerDeviceId[0]?.trim();
      if (first) return first;
    }

    return undefined;
  },
);
