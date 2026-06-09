import { DateUtil } from '@common/utils/date.utils';
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

    // Default values for RFC 7807 (especially for 500 Internal Server Errors to hide PII)
    let title = 'Internal Server Error';
    let type = 'INTERNAL_SERVER_ERROR';
    let detail = 'An unexpected error occurred.';
    let invalidParams: string[] | undefined;

    if (exception instanceof HttpException) {
      if (typeof rawResponse === 'string') {
        detail = rawResponse;
        title = exception.name || 'Http Exception';
        type = title.toUpperCase().replace(/\s+/g, '_');
      } else if (rawResponse && typeof rawResponse === 'object') {
        const resObj = rawResponse as Record<string, unknown>;

        // Extract title from NestJS default HTTP exception responses
        if (typeof resObj.error === 'string') {
          title = resObj.error;
          type = title.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        } else {
          title = exception.name || 'Http Exception';
          type = title.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        }

        // Handle detail and invalid parameters (e.g., from class-validator)
        if (Array.isArray(resObj.message)) {
          detail = 'One or more fields failed validation.';
          invalidParams = resObj.message as string[];
        } else if (typeof resObj.message === 'string') {
          detail = resObj.message;
        } else {
          detail = JSON.stringify(rawResponse);
        }
      }
    }

    // Log the error internally with full details including stack traces
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

    // Send RFC 7807 compliant response
    response.type('application/problem+json');
    response.status(status).json({
      type,
      title,
      status,
      detail,
      instance: request.url,
      timestamp: DateUtil.now().toISOString(),
      ...(invalidParams && { invalid_params: invalidParams }),
    });
  }
}
