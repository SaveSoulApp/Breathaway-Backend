import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TimezoneUtil } from '@common/utils/timezone.utils';

@Injectable()
export class TimezoneMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const timezone = req.headers['x-timezone'];

    // Use X-Timezone if present, otherwise default to UTC
    let timezoneValue: string;

    if (timezone) {
      timezoneValue = Array.isArray(timezone) ? timezone[0] : timezone;
    } else {
      timezoneValue = 'UTC'; // Default value
    }

    // Validate and normalize the timezone
    const normalizedTimezone = TimezoneUtil.normalizeTimezone(timezoneValue);

    // If invalid timezone provided, throw error
    if (!TimezoneUtil.isValidTimezone(timezoneValue) && timezoneValue !== '') {
      throw new BadRequestException({
        message: 'Invalid timezone in header',
        details: `"${timezoneValue}" is not a valid IANA timezone`,
        suggestion:
          'Use format like "Asia/Kolkata", "America/New_York", or omit for UTC',
      });
    }

    // Store in request object
    req['timezone'] = normalizedTimezone;

    next();
  }
}
