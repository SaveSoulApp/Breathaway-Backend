import { ClientIdentityKey } from '@common/enums';
import { ClientIdentityData } from '@common/interfaces';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts validated client identity metadata from the incoming request.
 *
 * The underlying data (e.g., app version, device ID) must be parsed and
 * injected into the request object by an upstream middleware or guard
 * (like ClientIdentityGuard) before this decorator can be used safely.
 *
 * @param data - Optional specific property of the ClientIdentityData to extract (e.g., 'deviceId'). If omitted, returns the entire identity object.
 * @returns The requested property value or the full ClientIdentityData object.
 */
export const ClientIdentity = createParamDecorator(
  (data: ClientIdentityKey | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ clientIdentity: ClientIdentityData }>();
    const identity: ClientIdentityData = request.clientIdentity;

    // Return specific property if requested, otherwise return the whole object
    if (data && identity) {
      return identity[data];
    }

    return identity;
  },
);
