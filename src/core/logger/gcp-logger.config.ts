import { DateUtil } from '@common/utils/date.utils';
import * as pino from 'pino';

export const createGcpLoggerConfig = (
  logLevel: string,
  appName: string,
  appVersion: string,
): pino.LoggerOptions => ({
  level: logLevel,
  formatters: {
    level: (label: string) => ({ severity: label.toUpperCase() }),
    bindings: (bindings) => ({
      ...bindings,
      serviceContext: {
        service: appName,
        version: appVersion,
      },
    }),
  },
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${DateUtil.now().toISOString()}"`,
  serializers: {
    error: pino.stdSerializers.err,
    req: (req: {
      method?: string;
      url?: string;
      headers?: unknown;
      remoteAddress?: string;
      remotePort?: number;
    }) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res: { statusCode?: number; headers?: unknown }) => ({
      statusCode: res.statusCode,
      headers: res.headers,
    }),
  },
  base: {
    serviceContext: {
      service: appName,
      version: appVersion,
    },
  },
});
