import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as pino from 'pino';

import { createGcpLoggerConfig } from './gcp-logger.config';
import { ContextualLogger } from './logger.interface';

@Injectable()
export class LoggerService implements NestLoggerService {
  private baseLogger: pino.Logger;

  constructor(private readonly configService: ConfigService) {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const logLevel = this.configService.get<string>('LOG_LEVEL') || 'info';
    const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

    const isGcp = this.configService.get<string>('DEPLOYMENT_ENV') === 'gcp';

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
        formatters: {
          level: (label: string) => ({ level: label.toUpperCase() }),
        },
      });
    }

    this.baseLogger.info(
      `📝 LoggerService initialized with level: ${logLevel}`,
    );
  }

  /**
   * Create a logger instance with context for services
   */
  forContext(context: string): ContextualLogger {
    const childLogger = this.baseLogger.child({ context });

    return {
      debug: (message: unknown, meta?: Record<string, unknown>) =>
        this.write(childLogger, 'debug', message, meta),
      info: (message: unknown, meta?: Record<string, unknown>) =>
        this.write(childLogger, 'info', message, meta),
      warn: (message: unknown, meta?: Record<string, unknown>) =>
        this.write(childLogger, 'warn', message, meta),
      error: (message: unknown, meta?: Record<string, unknown>) =>
        this.write(childLogger, 'error', message, meta),
      log: (message: unknown, meta?: Record<string, unknown>) =>
        this.write(childLogger, 'info', message, meta),
    };
  }

  /**
   * Unified write method for all loggers
   */
  private write(
    logger: pino.Logger,
    level: pino.Level,
    message: unknown,
    meta?: Record<string, unknown>,
  ) {
    const hasMeta = meta && Object.keys(meta).length > 0;

    if (typeof message === 'string') {
      if (hasMeta) {
        logger[level](meta, message);
      } else {
        logger[level](message);
      }
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
    } else if (typeof message === 'object' && message !== null) {
      logger[level]({ ...message, ...meta });
    } else {
      if (hasMeta) {
        logger[level](meta, String(message));
      } else {
        logger[level](String(message));
      }
    }
  }

  /**
   * NestJS LoggerService interface implementation
   */
  debug(message: unknown, contextOrMeta?: string | Record<string, unknown>) {
    const meta = typeof contextOrMeta === 'object' ? { ...contextOrMeta } : {};
    if (typeof contextOrMeta === 'string') {
      meta.context = contextOrMeta;
    }
    this.write(this.baseLogger, 'debug', message, meta);
  }

  info(message: unknown, contextOrMeta?: string | Record<string, unknown>) {
    const meta = typeof contextOrMeta === 'object' ? { ...contextOrMeta } : {};
    if (typeof contextOrMeta === 'string') {
      meta.context = contextOrMeta;
    }
    this.write(this.baseLogger, 'info', message, meta);
  }

  warn(message: unknown, contextOrMeta?: string | Record<string, unknown>) {
    const meta = typeof contextOrMeta === 'object' ? { ...contextOrMeta } : {};
    if (typeof contextOrMeta === 'string') {
      meta.context = contextOrMeta;
    }
    this.write(this.baseLogger, 'warn', message, meta);
  }

  error(message: unknown, contextOrMeta?: string | Record<string, unknown>) {
    const meta = typeof contextOrMeta === 'object' ? { ...contextOrMeta } : {};
    if (typeof contextOrMeta === 'string') {
      meta.context = contextOrMeta;
    }
    this.write(this.baseLogger, 'error', message, meta);
  }

  log(message: unknown, contextOrMeta?: string | Record<string, unknown>) {
    const meta = typeof contextOrMeta === 'object' ? { ...contextOrMeta } : {};
    if (typeof contextOrMeta === 'string') {
      meta.context = contextOrMeta;
    }
    this.write(this.baseLogger, 'info', message, meta);
  }
}
