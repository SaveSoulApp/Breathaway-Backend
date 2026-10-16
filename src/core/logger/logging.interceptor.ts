import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { LoggerService } from './logger.service';

/**
 * Intercepts incoming HTTP requests to log their entry and successful completion at DEBUG level.
 *
 * Emits two structured logs at DEBUG level for local and non-production diagnostics:
 * - `Incoming request` — on every incoming request (method, route, user agent, IP).
 * - `Request completed` — on successful response (status code and duration).
 *
 * In production (`LOG_LEVEL=info`), routine requests produce zero log volume, allowing
 * Cloud Run's native access logs to serve as the sole HTTP request log without duplicate
 * ingestion costs.
 *
 * Error paths are intentionally NOT handled here — they flow directly to the
 * `GlobalExceptionFilter` (and `PrismaExceptionFilter`), which serves as the single source
 * of truth for HTTP error outcomes and prevents duplicate error log entries.
 *
 * Correlation context (`requestId`, `logging.googleapis.com/trace`) is
 * injected automatically from CLS — call-sites never pass them manually.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Wraps the route handler to capture request timing and success outcome.
   *
   * Logs incoming request details immediately at DEBUG. On successful completion,
   * logs status code and duration at DEBUG. Any exception is left to
   * `GlobalExceptionFilter` to prevent duplicate error log entries.
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

    const requestId = this.cls?.isActive()
      ? this.cls.get<string>('requestId')
      : undefined;
    const start = Date.now();

    const logger = this.loggerService.forContext(contextName);

    logger.debug('Incoming request', {
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

        logger.debug('Request completed', {
          requestId,
          statusCode: res.statusCode,
          durationMs,
          httpRequest: { method, url },
        });
      }),
    );
  }
}
