import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';

interface PrismaErrorMapping {
  status: HttpStatus;
  type: string;
  title: string;
  detail: string;
}

const PRISMA_ERROR_MAP: Record<string, PrismaErrorMapping> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    type: 'CONFLICT',
    title: 'Conflict',
    detail: 'A record with this value already exists.',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    type: 'NOT_FOUND',
    title: 'Not Found',
    detail: 'The requested record was not found.',
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    type: 'BAD_REQUEST',
    title: 'Bad Request',
    detail: 'A related record constraint was violated.',
  },
  P2000: {
    status: HttpStatus.BAD_REQUEST,
    type: 'BAD_REQUEST',
    title: 'Bad Request',
    detail: 'The provided value is too long for this field.',
  },
  P2014: {
    status: HttpStatus.BAD_REQUEST,
    type: 'BAD_REQUEST',
    title: 'Bad Request',
    detail: 'A relation constraint was violated.',
  },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger;

  constructor(
    loggerService: LoggerService,
    private readonly cls: ClsService,
  ) {
    this.logger = loggerService.forContext(PrismaExceptionFilter.name);
  }

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.cls.isActive()
      ? this.cls.get<string>('requestId')
      : undefined;

    const mapped = PRISMA_ERROR_MAP[exception.code];
    const status = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (mapped) {
      // Known constraint — expected, log at warn
      this.logger.warn(`Prisma ${exception.code}: ${mapped.detail}`, {
        prismaCode: exception.code,
        prismaMeta: exception.meta, // field name etc. — safe to log, not to send to client
        requestId,
        path: request.url,
      });
    } else {
      // Unknown Prisma error — unexpected, log at error with full exception
      this.logger.error(exception, {
        prismaCode: exception.code,
        requestId,
        path: request.url,
      });
    }

    response
      .type('application/problem+json')
      .status(status)
      .json({
        type: mapped?.type ?? 'INTERNAL_SERVER_ERROR',
        title: mapped?.title ?? 'Internal Server Error',
        status,
        detail: mapped?.detail ?? 'An unexpected database error occurred.',
        instance: request.url,
        timestamp: DateUtil.now().toISOString(),
        requestId,
      });
  }
}
