/**
 * @fileoverview Barrel export file for the authentication module DTOs.
 *
 * Re-exports request and response Data Transfer Objects (DTOs) utilized by the AuthController
 * and AuthService to encapsulate, validate, and serialize client payload exchanges.
 */

export * from './request/add-secondary-auth.request.dto';
export * from './request/auth-signin.request.dto';
export * from './request/auth-signup.request.dto';
export * from './request/dev-login.request.dto';
export * from './request/social-auth.request.dto';
export * from './response/user-auth.response.dto';
