import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DOMAIN_EXCEPTION_HTTP_MAP } from '@shared/domain/exceptions/domain-exception.map';
import { DomainException } from '@shared/domain/exceptions/domain.exception';

export interface ValidationErrorResponse {
  statusCode?: number;
  error?: string;
  message?: string | string[];
}

interface ResolvedError {
  status: number;
  type: string;
  title: string;
  detail: string;
  invalidParams?: string[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger;
  private readonly isProduction: boolean;

  constructor(
    loggerService: LoggerService,
    configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.logger = loggerService.forContext(GlobalExceptionFilter.name);
    this.isProduction = configService.get('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.cls.isActive()
      ? this.cls.get<string>('requestId')
      : undefined;

    const resolved = this.resolveException(exception);

    this.log(
      exception,
      resolved.status,
      request.method,
      request.url,
      requestId,
    );

    response
      .type('application/problem+json')
      .status(resolved.status)
      .json({
        type: resolved.type,
        title: resolved.title,
        status: resolved.status,
        detail: this.sanitizeDetail(resolved.status, resolved.detail),
        instance: request.url,
        timestamp: DateUtil.now().toISOString(),
        requestId,
        ...(resolved.invalidParams && {
          invalid_params: resolved.invalidParams,
        }),
      });
  }

  private resolveException(exception: unknown): ResolvedError {
    // 1. NestJS HttpException (current pragmatic pattern — services throw these directly)
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    // 2. Domain exception (target pattern — mapped via registry)
    if (exception instanceof DomainException) {
      return this.resolveDomainException(exception);
    }

    // 3. Truly unexpected — always 500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      type: 'INTERNAL_SERVER_ERROR',
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred.',
    };
  }

  private resolveHttpException(exception: HttpException): ResolvedError {
    const status = exception.getStatus();
    const rawResponse = exception.getResponse();

    // String response (e.g., throw new NotFoundException('Profile not found'))
    if (typeof rawResponse === 'string') {
      return {
        status,
        type: exception.name.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        title: exception.name,
        detail: rawResponse,
      };
    }

    // Object response (NestJS default shape: { statusCode, error, message })
    if (rawResponse && typeof rawResponse === 'object') {
      const res = rawResponse as ValidationErrorResponse;

      const title =
        typeof res.error === 'string'
          ? res.error
          : (exception.name ?? 'Http Exception');
      const type = title.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      // class-validator produces message as string[] — preserve as invalid_params
      if (Array.isArray(res.message)) {
        return {
          status,
          type,
          title,
          detail: 'One or more fields failed validation.',
          invalidParams: res.message,
        };
      }

      return {
        status,
        type,
        title,
        detail:
          typeof res.message === 'string'
            ? res.message
            : JSON.stringify(rawResponse),
      };
    }

    return {
      status,
      type: 'HTTP_EXCEPTION',
      title: 'Http Exception',
      detail: 'An error occurred.',
    };
  }

  private resolveDomainException(exception: DomainException): ResolvedError {
    const status =
      DOMAIN_EXCEPTION_HTTP_MAP[exception.name] ??
      HttpStatus.INTERNAL_SERVER_ERROR;
    const title = HttpStatus[status]?.replace(/_/g, ' ') ?? 'Error';
    const type = title.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    return { status, type, title, detail: exception.message };
  }

  private sanitizeDetail(status: number, detail: string): string {
    // Never expose internal detail for 5xx errors in production
    if (this.isProduction && status >= 500) {
      return 'An unexpected error occurred.';
    }
    return detail;
  }

  private log(
    exception: unknown,
    status: number,
    method: string,
    url: string,
    requestId: string | undefined,
  ): void {
    const requestStart = this.cls.isActive()
      ? this.cls.get<number | undefined>('requestStart')
      : undefined;
    const latencyMs =
      requestStart !== undefined ? Date.now() - requestStart : undefined;

    const exceptionType =
      exception != null && typeof exception === 'object'
        ? exception.constructor.name
        : 'UnknownException';

    const meta = {
      requestId,
      statusCode: status,
      exceptionType,
      ...(latencyMs !== undefined && { latencyMs }),
    };

    if (status >= 500) {
      // Full error object — LoggerService.write() serializes the stack trace automatically
      this.logger.error(
        exception instanceof Error ? exception : new Error(String(exception)),
        { ...meta, method, url },
      );
    } else {
      // 4xx — expected client error, log at warn with message only (no stack trace needed)
      const message =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.warn(`Request failed: ${method} ${url}`, {
        ...meta,
        error: message,
      });
    }
  }
}
