import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';
import { LoggerService } from './logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly isProduction: boolean;
  private readonly shouldLogResponse: boolean;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.shouldLogResponse =
      this.configService.get('SHOULD_LOG_RESPONSE') === 'true';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const { method, url, headers, ip } = req;
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const contextName = `${controller}.${handler}`;

    const requestId = headers['x-request-id'] || randomUUID();
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
      tap({
        next: (responseBody) => {
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
        },
        // error: (err) => {
        //   const delay = Date.now() - start;
        //   logger.error(`Failed request: ${method} ${url}`, {
        //     requestId,
        //     statusCode: res.statusCode,
        //     latencyMs: delay,
        //     error: { message: err.message, stack: err.stack },
        //   });
        // },
      }),
    );
  }
}
