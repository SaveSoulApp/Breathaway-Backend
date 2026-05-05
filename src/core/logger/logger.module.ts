import { Global, Module } from '@nestjs/common';
import { ExceptionLoggingFilter } from './exception-logging.filter';
import { LoggerService } from './logger.service';
import { LoggingInterceptor } from './logging.interceptor';

@Global()
@Module({
  providers: [LoggerService, LoggingInterceptor, ExceptionLoggingFilter],
  exports: [LoggerService],
})
export class LoggerModule {}
