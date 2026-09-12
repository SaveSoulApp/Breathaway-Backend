import { LogEvent } from './log-event.constants';

export interface ContextualLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  debug(message: Error, meta?: Record<string, unknown>): void;
  debug(message: object, meta?: Record<string, unknown>): void;

  info(message: string, meta?: Record<string, unknown>): void;
  info(message: Error, meta?: Record<string, unknown>): void;
  info(message: object, meta?: Record<string, unknown>): void;

  warn(message: string, meta?: Record<string, unknown>): void;
  warn(message: Error, meta?: Record<string, unknown>): void;
  warn(message: object, meta?: Record<string, unknown>): void;

  error(message: string, meta?: Record<string, unknown>): void;
  error(message: Error, meta?: Record<string, unknown>): void;
  error(message: object, meta?: Record<string, unknown>): void;

  log(message: string, meta?: Record<string, unknown>): void;
  log(message: Error, meta?: Record<string, unknown>): void;
  log(message: object, meta?: Record<string, unknown>): void;

  /**
   * Emits a structured business event log at INFO level.
   *
   * The `name` parameter is constrained to the {@link LogEvent} union, which
   * enforces the `RESOURCE_ACTION` naming convention at compile time and
   * prevents free-text event names from drifting into the log stream.
   *
   * All standard context fields (`requestId`, `traceId`, `schema_version`)
   * are injected automatically — callers only need to provide the event name
   * and any domain-specific metadata.
   *
   * @example
   * ```ts
   * this.logger.event(LOG_EVENT.LIKE_CREATED, { likeId: like.id, userId });
   * ```
   */
  event(name: LogEvent, meta?: Record<string, unknown>): void;
}
