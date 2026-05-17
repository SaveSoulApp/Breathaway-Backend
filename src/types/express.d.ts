import { ClientIdentityData, UserAgentData } from '@common/interfaces';

declare global {
  namespace Express {
    interface Request {
      /**
       * Validated and normalized IANA timezone string injected by TimezoneMiddleware.
       * Falls back to 'UTC' if the x-timezone header is missing or invalid.
       */
      timezone: string;

      /**
       * Unique request ID injected by RequestIdMiddleware.
       * Either taken from the x-request-id header or generated as a UUID.
       */
      requestId: string;

      /**
       * Validated client identity payload injected by ClientIdentityGuard.
       * Contains the parsed API key, client ID, device ID, and user-agent data.
       */
      clientIdentity: ClientIdentityData;

      // ---------------------------------------------------------------------------
      // Legacy fields set by individual middlewares (pre-ClientIdentityGuard era).
      // Kept to support existing spec files without modification.
      // ---------------------------------------------------------------------------
      apiKey: string;
      clientId: string;
      deviceId: string;
      userAgentData: UserAgentData;
    }
  }
}
