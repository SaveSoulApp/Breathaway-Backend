import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Secures routes with optional JWT authentication.
 *
 * If a valid Bearer token is provided in the Authorization header,
 * the decoded user payload is attached to `request.user`.
 * If no token is provided, or if the token is invalid or expired,
 * the request continues unauthenticated with `request.user` set to `null`.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = unknown>(
    _err: unknown,
    user: unknown,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    return (user || null) as TUser;
  }
}
