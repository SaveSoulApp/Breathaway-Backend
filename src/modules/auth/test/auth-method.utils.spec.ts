import {
  getAuthMethodFromDecodedToken,
  AuthMethod,
  AuthMethodInfo,
} from '../utils/auth-method.utils';

describe('Auth Method Utils', () => {
  describe('getAuthMethodFromDecodedToken', () => {
    it('should extract phone auth method from phone token', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'phone',
        },
        phone_number: '+1234567890',
      };

      const result: AuthMethodInfo =
        getAuthMethodFromDecodedToken(decodedToken);

      expect(result).toEqual({
        method: AuthMethod.PHONE,
        identifier: '+1234567890',
        isVerified: true,
      });
    });

    it('should extract email auth method from password token', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'password',
        },
        email: 'test@example.com',
        email_verified: true,
      };

      const result: AuthMethodInfo =
        getAuthMethodFromDecodedToken(decodedToken);

      expect(result).toEqual({
        method: AuthMethod.EMAIL,
        identifier: 'test@example.com',
        isVerified: true,
      });
    });

    it('should extract Google auth method from google.com token', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'google.com',
        },
        email: 'test@gmail.com',
        email_verified: true,
      };

      const result: AuthMethodInfo =
        getAuthMethodFromDecodedToken(decodedToken);

      expect(result).toEqual({
        method: AuthMethod.GOOGLE,
        identifier: 'test@gmail.com',
        isVerified: true,
      });
    });

    it('should handle unverified email for password auth', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'password',
        },
        email: 'test@example.com',
        email_verified: false,
      };

      const result: AuthMethodInfo =
        getAuthMethodFromDecodedToken(decodedToken);

      expect(result.isVerified).toBe(false);
    });

    it('should handle unverified email for Google auth', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'google.com',
        },
        email: 'test@gmail.com',
        email_verified: false,
      };

      const result: AuthMethodInfo =
        getAuthMethodFromDecodedToken(decodedToken);

      expect(result.isVerified).toBe(false);
    });

    it('should throw error when sign_in_provider is missing', () => {
      const decodedToken = {
        firebase: {},
        email: 'test@example.com',
      };

      expect(() => getAuthMethodFromDecodedToken(decodedToken)).toThrow(
        'Unable to determine authentication method: sign_in_provider missing',
      );
    });

    it('should throw error when phone_number is missing for phone auth', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'phone',
        },
      };

      expect(() => getAuthMethodFromDecodedToken(decodedToken)).toThrow(
        'Phone number missing from token for phone authentication',
      );
    });

    it('should throw error when email is missing for password auth', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'password',
        },
      };

      expect(() => getAuthMethodFromDecodedToken(decodedToken)).toThrow(
        'Email missing from token for email authentication',
      );
    });

    it('should throw error when email is missing for Google auth', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'google.com',
        },
      };

      expect(() => getAuthMethodFromDecodedToken(decodedToken)).toThrow(
        'Email missing from token for Google authentication',
      );
    });

    it('should throw error for unsupported authentication provider', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'facebook.com',
        },
        email: 'test@facebook.com',
      };

      expect(() => getAuthMethodFromDecodedToken(decodedToken)).toThrow(
        'Unsupported authentication provider: facebook.com',
      );
    });

    it('should handle missing email_verified field as false for password auth', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'password',
        },
        email: 'test@example.com',
      };

      const result: AuthMethodInfo =
        getAuthMethodFromDecodedToken(decodedToken);

      expect(result.isVerified).toBe(false);
    });

    it('should handle missing email_verified field as false for Google auth', () => {
      const decodedToken = {
        firebase: {
          sign_in_provider: 'google.com',
        },
        email: 'test@gmail.com',
      };

      const result: AuthMethodInfo =
        getAuthMethodFromDecodedToken(decodedToken);

      expect(result.isVerified).toBe(false);
    });
  });
});
