export interface ContextualLogger {
  debug(message: string, meta?: Record<string, any>): void;
  debug(message: Error, meta?: Record<string, any>): void;
  debug(message: object, meta?: Record<string, any>): void;

  info(message: string, meta?: Record<string, any>): void;
  info(message: Error, meta?: Record<string, any>): void;
  info(message: object, meta?: Record<string, any>): void;

  warn(message: string, meta?: Record<string, any>): void;
  warn(message: Error, meta?: Record<string, any>): void;
  warn(message: object, meta?: Record<string, any>): void;

  error(message: string, meta?: Record<string, any>): void;
  error(message: Error, meta?: Record<string, any>): void;
  error(message: object, meta?: Record<string, any>): void;

  log(message: string, meta?: Record<string, any>): void;
  log(message: Error, meta?: Record<string, any>): void;
  log(message: object, meta?: Record<string, any>): void;
}
