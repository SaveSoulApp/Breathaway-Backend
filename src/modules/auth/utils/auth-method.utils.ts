/**
 * Supported authentication methods and identity provider identifiers.
 *
 * Maps Firebase authentication provider strings (e.g., 'password' for email/password,
 * 'phone' for SMS, and domain-based providers for social logins) to internal application methods.
 */
export enum AuthMethod {
  /** SMS-based phone number authentication. */
  PHONE = 'phone',
  /** Email and password authentication. */
  EMAIL = 'password', // Firebase uses 'password' for email/password auth
  /** Google OAuth authentication. */
  GOOGLE = 'google.com',
  /** Facebook OAuth authentication. */
  FACEBOOK = 'facebook.com',
  // Add other providers as needed
}

/**
 * Structured information representing a verified authentication identity.
 *
 * Used internally to pass the resolved identity provider, unique user identifier,
 * and verification status after parsing authentication payloads.
 */
export interface AuthMethodInfo {
  /** The identified authentication provider/method used. */
  method: AuthMethod;
  /** The unique credential identifier associated with the authentication method (e.g., phone number or email address). */
  identifier: string; // phone number or email
  /** Flag indicating whether the identifier has been verified by the auth provider. */
  isVerified: boolean;
}

/**
 * Internal representation of a decoded Firebase ID token payload.
 *
 * Contains identity provider metadata and user profile claims populated by the
 * Firebase Auth service during token verification.
 */
export interface DecodedFirebaseToken {
  /** Firebase-specific metadata regarding the session. */
  firebase?: {
    /** The string representing the identity provider used to log in. */
    sign_in_provider?: string;
    [key: string]: unknown;
  };
  /** The user's phone number, present if authenticated via SMS. */
  phone_number?: string;
  /** The user's email address, present if authenticated via email or social logins. */
  email?: string;
  /** Whether the user's email address has been verified. */
  email_verified?: boolean;
  [key: string]: unknown;
}

/**
 * Parses a decoded Firebase ID token to extract the authentication method, identifier, and verification status.
 *
 * Resolves the authentication channel (e.g., SMS, email, or Google) and validates that the token includes the
 * necessary payload properties for that method.
 *
 * @param decodedToken - The decoded token claims payload returned from Firebase Admin SDK verification.
 * @returns An object containing the resolved AuthMethod, the user's unique identifier (email/phone), and verification state.
 * @throws {Error} When the sign-in provider is missing from the token.
 * @throws {Error} When critical identifying claims (like phone_number or email) are missing for the determined provider.
 * @throws {Error} When the sign-in provider is not supported by the application.
 */
export function getAuthMethodFromDecodedToken(
  decodedToken: DecodedFirebaseToken,
): AuthMethodInfo {
  const firebaseData = decodedToken.firebase || {};
  const signInProvider = firebaseData.sign_in_provider;

  if (!signInProvider) {
    throw new Error(
      'Unable to determine authentication method: sign_in_provider missing',
    );
  }

  let method: AuthMethod;
  let identifier: string;
  let isVerified: boolean = false;

  switch (signInProvider) {
    case 'phone': {
      method = AuthMethod.PHONE;
      const phoneNumber = decodedToken.phone_number;
      if (!phoneNumber) {
        throw new Error(
          'Phone number missing from token for phone authentication',
        );
      }
      identifier = phoneNumber;
      isVerified = true;
      break;
    }

    case 'password': {
      method = AuthMethod.EMAIL;
      const email = decodedToken.email;
      if (!email) {
        throw new Error('Email missing from token for email authentication');
      }
      identifier = email;
      isVerified = decodedToken.email_verified || false;
      break;
    }

    case 'google.com': {
      method = AuthMethod.GOOGLE;
      const email = decodedToken.email;
      if (!email) {
        throw new Error('Email missing from token for Google authentication');
      }
      identifier = email;
      isVerified = decodedToken.email_verified || false;
      break;
    }

    default:
      throw new Error(`Unsupported authentication provider: ${signInProvider}`);
  }

  return { method, identifier, isVerified };
}
