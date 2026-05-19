export enum AuthMethod {
  PHONE = 'phone',
  EMAIL = 'password', // Firebase uses 'password' for email/password auth
  GOOGLE = 'google.com',
  FACEBOOK = 'facebook.com',
  // Add other providers as needed
}

export interface AuthMethodInfo {
  method: AuthMethod;
  identifier: string; // phone number or email
  isVerified: boolean;
}

export interface DecodedFirebaseToken {
  firebase?: {
    sign_in_provider?: string;
    [key: string]: unknown;
  };
  phone_number?: string;
  email?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

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
    case 'phone':
      method = AuthMethod.PHONE;
      identifier = decodedToken.phone_number;
      if (!identifier) {
        throw new Error(
          'Phone number missing from token for phone authentication',
        );
      }
      isVerified = true;
      break;

    case 'password':
      method = AuthMethod.EMAIL;
      identifier = decodedToken.email;
      if (!identifier) {
        throw new Error('Email missing from token for email authentication');
      }
      isVerified = decodedToken.email_verified || false;
      break;

    case 'google.com':
      method = AuthMethod.GOOGLE;
      identifier = decodedToken.email;
      if (!identifier) {
        throw new Error('Email missing from token for Google authentication');
      }
      isVerified = decodedToken.email_verified || false;
      break;

    default:
      throw new Error(`Unsupported authentication provider: ${signInProvider}`);
  }

  return { method, identifier, isVerified };
}
