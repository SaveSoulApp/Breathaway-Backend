import { Observable, tap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ClsService } from 'nestjs-cls';
import { LOG_EVENT } from './log-event.constants';
import { LoggerService } from './logger.service';

/**
 * Intercepts incoming HTTP requests to log their lifecycle at INFO level.
 *
 * Emits three structured events using the typed {@link LOG_EVENT} names:
 * - `REQUEST_RECEIVED` — on every incoming request (method, route, ids).
 * - `REQUEST_COMPLETED` — on success (adds status code and duration).
 * - `REQUEST_FAILED` — on error (adds status code and duration); re-throws
 *   the error so the `GlobalExceptionFilter` can handle exception detail.
 *   This split avoids log duplication: lifecycle metadata here, stack trace there.
 *
 * Correlation context (`requestId`, `logging.googleapis.com/trace`) is
 * injected automatically from CLS — call-sites never pass them manually.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly isProduction: boolean;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
  }

  /**
   * Wraps the route handler to capture request timing and outcome.
   *
   * Logs `REQUEST_RECEIVED` immediately (INFO). On successful completion logs
   * `REQUEST_COMPLETED` (INFO). On any error logs `REQUEST_FAILED` (WARN for
   * 4xx, ERROR for 5xx) as a **lifecycle event only** — the exception detail
   * is left to `GlobalExceptionFilter` to avoid duplicate stack traces.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      headers: Record<string, string | undefined>;
      ip: string;
    }>();
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();

    const { method, url, headers, ip } = req;
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const contextName = `${controller}.${handler}`;

    const requestId = this.cls.get<string>('requestId');
    const start = Date.now();

    const logger = this.loggerService.forContext(contextName);

    logger.event(LOG_EVENT.REQUEST_RECEIVED, {
      requestId,
      httpRequest: {
        method,
        url,
        userAgent: headers['x-user-agent'],
        remoteIp: ip,
      },
    });

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;

        logger.event(LOG_EVENT.REQUEST_COMPLETED, {
          requestId,
          statusCode: res.statusCode,
          durationMs,
          httpRequest: { method, url },
        });
      }),
      catchError((err: unknown) => {
        const durationMs = Date.now() - start;

        // Determine the status code from the error when possible.
        // HttpException exposes getStatus(); fall back to 500 for unknowns.
        const statusCode =
          err != null &&
          typeof err === 'object' &&
          'getStatus' in err &&
          typeof (err as { getStatus: unknown }).getStatus === 'function'
            ? (err as { getStatus: () => number }).getStatus()
            : 500;

        const logLevel = statusCode >= 500 ? 'error' : 'warn';

        // Log only the REQUEST_FAILED lifecycle event here.
        // The exception detail (stack trace, error message) is logged by
        // GlobalExceptionFilter to avoid duplicate error log entries.
        logger[logLevel](
          { event: LOG_EVENT.REQUEST_FAILED },
          {
            requestId,
            statusCode,
            durationMs,
            httpRequest: { method, url },
          },
        );

        // Always re-throw — the GlobalExceptionFilter must still handle it.
        return throwError(() => err);
      }),
    );
  }
}
