import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';

// 1. Define the strict shape of the JWT payload
/**
 * Represents the structured payload contained within a valid JWT.
 */
export interface JwtPayload {
  userId: string;
  email: string;
}

// 2. Extend the base Request to enforce the presence of the user object
/**
 * Extends the base Express request to guarantee the presence of the authenticated user payload.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Extracts the authenticated user's ID from the JWT payload injected into the request object.
 *
 * Must be used on routes protected by a JWT auth guard that populates the `request.user` property.
 * Fails safely with an internal server error if the auth guard was missing or misconfigured.
 */
export const CurrentUserId = createParamDecorator(
  // Explicitly declare the return type of the decorator
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user || !request.user.userId) {
      throw new InternalServerErrorException(
        'User payload missing from request context. Ensure AuthGuard is applied.',
      );
    }

    return request.user.userId;
  },
);
