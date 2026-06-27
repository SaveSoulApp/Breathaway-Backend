import { Global, Module } from '@nestjs/common';
import { ExceptionLoggingFilter } from './exception-logging.filter';
import { LoggerService } from './logger.service';
import { LoggingInterceptor } from './logging.interceptor';

/**
 * Encapsulates application-wide logging configuration and related interceptors.
 *
 * Registers the Pino-based LoggerService globally, sets up the HTTP request/response
 * logging interceptor, and provides the global exception filter for standardized error formatting.
 *
 * Exports:
 *   - LoggerService: Exposed globally so feature modules can create contextual loggers.
 */
@Global()
@Module({
  providers: [LoggerService, LoggingInterceptor, ExceptionLoggingFilter],
  exports: [LoggerService],
})
export class LoggerModule {}
