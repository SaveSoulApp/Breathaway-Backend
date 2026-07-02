import { DateUtil } from '@common/utils/date.utils';
import * as pino from 'pino';

const PINO_LEVEL_TO_CLOUD_SEVERITY: Record<string, string> = {
  trace: 'DEFAULT',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export const createGcpLoggerConfig = (
  logLevel: string,
  appName: string,
  appVersion: string,
): pino.LoggerOptions => ({
  level: logLevel,
  formatters: {
    level: (label: string) => ({
      severity: PINO_LEVEL_TO_CLOUD_SEVERITY[label] || 'DEFAULT',
    }),
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
