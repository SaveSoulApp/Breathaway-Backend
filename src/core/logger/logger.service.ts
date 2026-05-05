import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as pino from 'pino';
import { createGcpLoggerConfig } from './gcp-logger.config';
import { ContextualLogger } from './logger.interface';

@Injectable()
export class LoggerService implements NestLoggerService {
  private baseLogger: pino.Logger;

  constructor(private readonly configService: ConfigService) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const logLevel = this.configService.get('LOG_LEVEL') || 'info';
    const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

    const isGcp = this.configService.get('DEPLOYMENT_ENV') === 'gcp';

    if (!validLevels.includes(logLevel)) {
      throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
    }

    const transport = isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        };

    if (isGcp) {
      const gcpConfig = createGcpLoggerConfig(logLevel);
      this.baseLogger = pino.default(gcpConfig);
    } else {
      this.baseLogger = pino.default({
        level: logLevel,
        transport,
        timestamp: pino.stdTimeFunctions.isoTime,
      });
    }

    console.log(`📝 LoggerService initialized with level: ${logLevel}`);
  }

  /**
   * Create a logger instance with context for services
   */
  forContext(context: string): ContextualLogger {
    const childLogger = this.baseLogger.child({
      context,
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
    });

    return {
      debug: (message: any, meta?: Record<string, any>) =>
        this.write(childLogger, 'debug', message, meta),
      info: (message: any, meta?: Record<string, any>) =>
        this.write(childLogger, 'info', message, meta),
      warn: (message: any, meta?: Record<string, any>) =>
        this.write(childLogger, 'warn', message, meta),
      error: (message: any, meta?: Record<string, any>) =>
        this.write(childLogger, 'error', message, meta),
      log: (message: any, meta?: Record<string, any>) =>
        this.write(childLogger, 'info', message, meta),
    };
  }

  /**
   * Unified write method for all loggers
   */
  private write(
    logger: any,
    level: pino.Level,
    message: any,
    meta?: Record<string, any>,
  ) {
    if (typeof message === 'string') {
      logger[level](meta, message);
    } else if (message instanceof Error) {
      logger[level](
        {
          ...meta,
          error: {
            message: message.message,
            stack: message.stack,
            name: message.name,
          },
        },
        message.message,
      );
    } else if (typeof message === 'object') {
      logger[level]({ ...message, ...meta });
    } else {
      logger[level](meta, String(message));
    }
  }

  /**
   * NestJS LoggerService interface implementation
   */
  debug(message: any, contextOrMeta?: string | Record<string, any>) {
    const context =
      typeof contextOrMeta === 'string' ? contextOrMeta : undefined;
    const meta = typeof contextOrMeta === 'object' ? contextOrMeta : {};

    const tempLogger = this.baseLogger.child({
      context,
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
    });
    this.write(tempLogger, 'debug', message, meta);
  }

  info(message: any, contextOrMeta?: string | Record<string, any>) {
    const context =
      typeof contextOrMeta === 'string' ? contextOrMeta : undefined;
    const meta = typeof contextOrMeta === 'object' ? contextOrMeta : {};

    const tempLogger = this.baseLogger.child({
      context,
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
    });
    this.write(tempLogger, 'info', message, meta);
  }

  warn(message: any, contextOrMeta?: string | Record<string, any>) {
    const context =
      typeof contextOrMeta === 'string' ? contextOrMeta : undefined;
    const meta = typeof contextOrMeta === 'object' ? contextOrMeta : {};

    const tempLogger = this.baseLogger.child({
      context,
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
    });
    this.write(tempLogger, 'warn', message, meta);
  }

  error(message: any, contextOrMeta?: string | Record<string, any>) {
    const context =
      typeof contextOrMeta === 'string' ? contextOrMeta : undefined;
    const meta = typeof contextOrMeta === 'object' ? contextOrMeta : {};

    const tempLogger = this.baseLogger.child({
      context,
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
    });
    this.write(tempLogger, 'error', message, meta);
  }

  log(message: any, contextOrMeta?: string | Record<string, any>) {
    const context =
      typeof contextOrMeta === 'string' ? contextOrMeta : undefined;
    const meta = typeof contextOrMeta === 'object' ? contextOrMeta : {};

    const tempLogger = this.baseLogger.child({
      context,
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
    });
    this.write(tempLogger, 'info', message, meta);
  }
}
