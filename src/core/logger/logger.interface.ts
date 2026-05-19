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
}
