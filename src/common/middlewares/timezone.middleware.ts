import { TimezoneUtil } from '@common/utils/timezone.utils';
import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class TimezoneMiddleware implements NestMiddleware {
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
