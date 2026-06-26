import { TimezoneUtil } from '@common/utils/timezone.utils';
import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Normalizes the client-provided timezone and attaches it to the request context.
 *
 * Extracts the `X-Timezone` header, defaulting to `UTC` if absent. This ensures
 * that downstream services and repositories can accurately process date-time logic
 * relative to the user's localized context.
 */
@Injectable()
export class TimezoneMiddleware implements NestMiddleware {
  /**
   * Validates and coerces the timezone header into a standard IANA timezone format.
   *
   * @throws {BadRequestException} When the provided timezone string is not a valid IANA identifier.
   */
  use(req: Request, res: Response, next: NextFunction) {
    const timezoneHeader = req.headers['x-timezone'];

    const timezoneValue = timezoneHeader
      ? Array.isArray(timezoneHeader)
        ? timezoneHeader[0]
        : timezoneHeader
      : 'UTC';

    if (!TimezoneUtil.isValidTimezone(timezoneValue)) {
      throw new BadRequestException({
        message: 'Invalid timezone in header',
        details: `"${timezoneValue}" is not a valid IANA timezone`,
        suggestion:
          'Use format like "Asia/Kolkata", "America/New_York", or omit for UTC',
      });
    }

    req.timezone = TimezoneUtil.normalizeTimezone(timezoneValue);

    next();
  }
}
