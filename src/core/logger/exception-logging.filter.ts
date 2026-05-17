import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ContextualLogger } from './logger.interface';
import { LoggerService } from './logger.service';

@Catch()
export class ExceptionLoggingFilter implements ExceptionFilter {
  private readonly logger: ContextualLogger;

  constructor(private readonly loggerService: LoggerService) {
    this.logger = this.loggerService.forContext(ExceptionLoggingFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message =
      typeof rawResponse === 'string'
        ? rawResponse
        : Array.isArray((rawResponse as any).message)
          ? (rawResponse as any).message
          : ((rawResponse as any).message ?? rawResponse);

    // Log the error with correct status code
    this.logger.error(`Request failed: ${request.method} ${request.url}`, {
      requestId: request.headers['x-request-id'],
      statusCode: status,
      error:
        exception instanceof Error
          ? {
              message: exception.message,
              stack: exception.stack,
              name: exception.name,
            }
          : String(exception),
    });

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }
}
