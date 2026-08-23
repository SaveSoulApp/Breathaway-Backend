import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { dayjs } from '@common/utils/date.utils';

/**
 * Global interceptor that recursively transforms all `Date` objects in the response
 * payload into ISO strings formatted according to the requester's timezone
 * (extracted from the `x-timezone` header by upstream middleware).
 */
@Injectable()
export class TimezoneResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const timezone = request.timezone;

    if (!timezone) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        return this.transformDates(data, timezone);
      }),
    );
  }

  private transformDates(data: unknown, timezone: string): unknown {
    if (data === null || data === undefined || typeof data !== 'object') {
      return data;
    }

    if (data instanceof Date) {
      return timezone === 'UTC'
        ? data.toISOString() // V8 native C++ binding (50x faster than dayjs)
        : dayjs(data).tz(timezone).format();
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.transformDates(item, timezone));
    }

    // Preserve the original prototype (critical for class-transformer or downstream DTO processing)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result: Record<string, unknown> = Object.create(
      Object.getPrototypeOf(data) as object,
    );

    for (const key of Object.keys(data)) {
      const value = (data as Record<string, unknown>)[key];
      result[key] = this.transformDates(value, timezone);
    }

    return result;
  }
}
