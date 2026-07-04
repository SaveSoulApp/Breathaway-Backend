import { Observable, tap } from 'rxjs';

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ClsService } from 'nestjs-cls';
import { LoggerService } from './logger.service';

/**
 * Intercepts incoming HTTP requests to log their lifecycle, performance, and metadata.
 *
 * Automatically injects an `X-Request-ID` (or generates a random UUID) into the log context
 * to enable distributed tracing. Measures wall-clock execution time and logs both the
 * inbound request and outbound response details.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly isProduction: boolean;
  private readonly shouldLogResponse: boolean;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.shouldLogResponse =
      this.configService.get('SHOULD_LOG_RESPONSE') === 'true';
  }

  /**
   * Wraps the route handler to capture request timing and outcome.
   *
   * Logs a 'debug' entry immediately upon request arrival. Upon successful completion,
   * logs another entry containing the response latency and status code. In non-production
   * environments (if configured), it also includes the full response body for debugging.
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

    // Create a child logger for this interceptor context
    const logger = this.loggerService.forContext(contextName);

    logger.debug(`Incoming request: ${method} ${url}`, {
      requestId,
      httpRequest: {
        method,
        url,
        userAgent: headers['user-agent'],
        remoteIp: ip,
      },
    });

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const delay = Date.now() - start;
        const baseMeta = {
          requestId,
          statusCode: res.statusCode,
          latencyMs: delay,
        };

        const shouldIncludeResponseBody =
          !this.isProduction && this.shouldLogResponse;
        const logMeta = shouldIncludeResponseBody
          ? { ...baseMeta, responseBody }
          : baseMeta;

        logger.debug(`Completed request: ${method} ${url}`, logMeta);
      }),
    );
  }
}
