import { serializeError } from './error.utils';

interface LoggerLike {
  log(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface Closeable {
  close?: () => unknown;
  quit?: () => unknown;
}

/**
 * Reusable utility to gracefully close or quit a client connection.
 *
 * @param client - The client connection instance (e.g. Redis, PubSub, KMS, Secret Manager)
 * @param logger - Logger instance supporting log/error methods
 * @param clientName - Friendly name of the client for logging context
 * @param closeMethod - The cleanup method name ('close' or 'quit', defaults to 'close')
 */
export async function safeCloseClient(
  client: Closeable | null | undefined,
  logger: LoggerLike,
  clientName: string,
  closeMethod: 'close' | 'quit' = 'close',
): Promise<void> {
  if (client) {
    const fn = client[closeMethod];
    if (typeof fn === 'function') {
      logger.log(`Closing ${clientName} client connection`, {
        step: 'destroy',
      });
      try {
        await fn.call(client);
      } catch (error) {
        logger.error(`Failed to close ${clientName} client connection`, {
          step: 'destroy',
          err: serializeError(error),
        });
      }
    }
  }
}
