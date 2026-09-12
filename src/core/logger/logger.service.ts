import {
  Injectable,
  LoggerService as NestLoggerService,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import * as pino from 'pino';

import {
  createGcpLoggerConfig,
  parseCloudTraceContext,
} from './gcp-logger.config';
import { LogEvent } from './log-event.constants';
import { ContextualLogger } from './logger.interface';

/**
 * Provides a standardized, highly performant logging interface wrapping Pino.
 *
 * Configures environment-specific log formats (e.g., pretty-printing for local development,
 * JSON-structured logging for GCP Cloud Logging). It acts as the central logging sink for the
 * entire application, ensuring all log output adheres to a consistent structure.
 *
 * All logs emitted via {@link ContextualLogger.event} or the standard level methods are
 * automatically enriched with `requestId` and `logging.googleapis.com/trace` from the
 * active CLS context — callers never need to pass these fields manually.
 */
@Injectable()
export class LoggerService implements NestLoggerService, OnApplicationShutdown {
  private baseLogger: pino.Logger;
  private readonly gcpProjectId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const logLevel = this.configService.get<string>('LOG_LEVEL') || 'info';
    const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

    const isGcp = this.configService.get<string>('DEPLOYMENT_ENV') === 'gcp';

    this.gcpProjectId =
      this.configService.get<string>('GCP_PROJECT_ID') || 'unknown-project';

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
      const appName =
        this.configService.get<string>('APP_NAME') || 'nestjs-app';
      const appVersion =
        this.configService.get<string>('APP_VERSION') || '1.0.0';
      const gcpConfig = createGcpLoggerConfig(
        logLevel,
        appName,
        appVersion,
        this.gcpProjectId,
      );
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
   * Creates an isolated, context-aware logger instance for a specific class or module.
   *
   * All logs emitted through the returned ContextualLogger will automatically include
   * the provided context string, making it easier to filter logs by source.
   *
   * The `event()` method on the returned logger enforces compile-time event name
   * validation via the {@link LogEvent} union type — preventing free-text drift.
   *
   * @param context - The name of the class, module, or component requesting the logger.
   * @returns A ContextualLogger exposing standard logging methods plus the typed `event()` helper.
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
      /**
       * Emits a structured business event at INFO level with the `event` field
       * set to the given {@link LogEvent} name. All context fields (requestId,
       * trace, spanId) are auto-injected from the active CLS context.
       */
      event: (name: LogEvent, meta?: Record<string, unknown>) =>
        this.write(childLogger, 'info', `[EVENT] ${name}`, {
          event: name,
          ...meta,
        }),
    };
  }

  /**
   * Unified write method for all log levels.
   *
   * Reads the active CLS context and auto-injects:
   * - `requestId` from the `requestId` CLS key.
   * - `logging.googleapis.com/trace` in the format `projects/PROJECT_ID/traces/TRACE_ID`.
   * - `logging.googleapis.com/spanId` extracted from the raw `X-Cloud-Trace-Context` header.
   * - `logging.googleapis.com/trace_sampled` boolean.
   *
   * Failures inside this method are intentionally swallowed with a `console.error` fallback
   * to ensure logging never throws into business logic (§1.2 of the logging spec).
   */
  private write(
    logger: pino.Logger,
    level: pino.Level,
    message: unknown,
    meta?: Record<string, unknown>,
  ) {
    try {
      let finalMeta = meta;

      if (this.cls && this.cls.isActive()) {
        const requestId = this.cls.get<string>('requestId');
        const rawTraceContext = this.cls.get<string>('traceContext');

        const { trace, spanId, traceSampled } = parseCloudTraceContext(
          rawTraceContext,
          this.gcpProjectId,
        );

        const clsFields: Record<string, unknown> = {};
        if (requestId) clsFields.requestId = requestId;
        if (trace) clsFields['logging.googleapis.com/trace'] = trace;
        if (spanId) clsFields['logging.googleapis.com/spanId'] = spanId;
        if (trace) {
          clsFields['logging.googleapis.com/trace_sampled'] = traceSampled;
        }

        if (Object.keys(clsFields).length > 0) {
          finalMeta = { ...meta, ...clsFields };
        }
      }

      const hasMeta = finalMeta && Object.keys(finalMeta).length > 0;

      if (typeof message === 'string') {
        if (hasMeta) {
          logger[level](finalMeta, message);
        } else {
          logger[level](message);
        }
      } else if (message instanceof Error) {
        logger[level](
          {
            ...finalMeta,
            error: {
              message: message.message,
              stack: message.stack,
              name: message.name,
            },
          },
          message.message,
        );
      } else if (typeof message === 'object' && message !== null) {
        logger[level]({ ...message, ...finalMeta });
      } else {
        if (hasMeta) {
          logger[level](finalMeta, String(message));
        } else {
          logger[level](String(message));
        }
      }
    } catch (logErr) {
      // Logging must never break business logic (§1.2).
      // Any failure here is a best-effort fallback — never rethrow.
      console.error('[LoggerService] Failed to write log entry:', logErr);
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

  onApplicationShutdown() {
    this.baseLogger.info(
      { step: 'shutdown' },
      'Flushing LoggerService logs...',
    );
    this.baseLogger.flush();
  }
}
