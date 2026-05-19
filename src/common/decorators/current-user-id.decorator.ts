import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';

// 1. Define the strict shape of the JWT payload
export interface JwtPayload {
  userId: string;
  email: string;
}

// 2. Extend the base Request to enforce the presence of the user object
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

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
