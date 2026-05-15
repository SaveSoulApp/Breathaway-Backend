import { TimezoneUtil } from '@common/utils/timezone.utils';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class TimezoneMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const timezoneHeader = req.headers['x-timezone'];

    let timezoneValue = timezoneHeader
      ? Array.isArray(timezoneHeader)
        ? timezoneHeader[0]
        : timezoneHeader
      : 'UTC';

    const normalizedTimezone = TimezoneUtil.normalizeTimezone(timezoneValue);

    // Fail-safe: If invalid, fallback to UTC instead of throwing
    if (!TimezoneUtil.isValidTimezone(timezoneValue)) {
      req['timezone'] = 'UTC';
    } else {
      req['timezone'] = normalizedTimezone;
    }

    next();
  }
}
