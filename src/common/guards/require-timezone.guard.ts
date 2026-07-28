import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Guard that enforces the presence of the `X-Timezone` header on a request.
 * Useful for endpoints that perform sensitive date math (like expiration calculation)
 * where defaulting to UTC would cause silent bugs in local time calculation.
 */
@Injectable()
export class RequireTimezoneGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.headers['x-timezone']) {
      throw new BadRequestException(
        'The x-timezone header is required for this endpoint to accurately process credit expiration.',
      );
    }

    return true;
  }
}
