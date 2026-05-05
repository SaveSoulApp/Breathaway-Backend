import * as pino from 'pino';

export const createGcpLoggerConfig = (
  logLevel: string,
): pino.LoggerOptions => ({
  level: logLevel,
  formatters: {
    level: (label: string) => ({ severity: label.toUpperCase() }),
    bindings: (bindings) => ({
      ...bindings,
      serviceContext: {
        service: process.env.npm_package_name || 'nestjs-app',
        version: process.env.npm_package_version || '1.0.0',
      },
    }),
  },
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  serializers: {
    error: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.headers,
    }),
  },
  base: {
    serviceContext: {
      service: process.env.npm_package_name || 'nestjs-app',
      version: process.env.npm_package_version || '1.0.0',
    },
  },
});
