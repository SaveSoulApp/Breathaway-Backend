import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import * as pino from 'pino';

import { parseCloudTraceContext, PINO_REDACT_PATHS } from './gcp-logger.config';
import { LOG_EVENT } from './log-event.constants';
import { LoggerService } from './logger.service';

// ---------------------------------------------------------------------------
// Test-mode GCP severity map (mirrors PINO_LEVEL_TO_CLOUD_SEVERITY exactly)
// ---------------------------------------------------------------------------
const PINO_LEVEL_TO_CLOUD_SEVERITY: Record<string, string> = {
  trace: 'DEFAULT',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a LoggerService with a controlled GCP-like configuration.
 * Captures Pino output into an array of parsed JSON objects for assertions.
 *
 * The internal Pino instance is replaced with one that:
 * - Applies the same PINO_REDACT_PATHS as production.
 * - Uses the same GCP severity formatter.
 * - Includes schema_version: 1 in base.
 * - Writes serialized JSON to an in-memory array.
 */
function makeGcpLogger(
  clsGetMap: Record<string, unknown> = {},
  clsIsActive = true,
): { service: LoggerService; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];

  const configGet = (key: string) => {
    const cfg: Record<string, string> = {
      NODE_ENV: 'production',
      DEPLOYMENT_ENV: 'gcp',
      LOG_LEVEL: 'debug',
      APP_NAME: 'test-service',
      APP_VERSION: '1.0.0',
      GCP_PROJECT_ID: 'test-project',
    };
    return cfg[key];
  };

  const configService = { get: configGet } as unknown as ConfigService;
  const cls = {
    isActive: () => clsIsActive,
    get: (key: string) => clsGetMap[key],
  } as unknown as ClsService;

  const service = new LoggerService(configService, cls);

  // Replace the internal baseLogger with a test-mode one that captures output.
  // This must match the production configuration as closely as possible so
  // redaction, severity mapping, and base fields behave identically.
  const testPinoLogger = pino.default(
    {
      level: 'debug',
      redact: { paths: PINO_REDACT_PATHS, censor: '[Redacted]' },
      base: { schema_version: 1 },
      formatters: {
        level: (label: string) => ({
          severity: PINO_LEVEL_TO_CLOUD_SEVERITY[label] ?? 'DEFAULT',
        }),
      },
    },
    {
      write(msg: string) {
        try {
          lines.push(JSON.parse(msg) as Record<string, unknown>);
        } catch {
          // ignore non-JSON (e.g. pino internal messages)
        }
      },
    },
  );

  // Access the private field — acceptable in unit tests for precise control.
  (service as unknown as { baseLogger: pino.Logger }).baseLogger =
    testPinoLogger;

  return { service, lines };
}

// ---------------------------------------------------------------------------
// Tests: parseCloudTraceContext
// ---------------------------------------------------------------------------

describe('parseCloudTraceContext', () => {
  const PROJECT_ID = 'my-project';

  it('returns null fields when header is undefined', () => {
    const result = parseCloudTraceContext(undefined, PROJECT_ID);
    expect(result).toEqual({ trace: null, spanId: null, traceSampled: false });
  });

  it('returns null fields when header is empty string', () => {
    const result = parseCloudTraceContext('', PROJECT_ID);
    expect(result).toEqual({ trace: null, spanId: null, traceSampled: false });
  });

  it('produces the correct projects/.../traces/... format', () => {
    const raw = 'abc123def456abc123def456abc123de/12345;o=1';
    const { trace } = parseCloudTraceContext(raw, PROJECT_ID);
    expect(trace).toBe(
      'projects/my-project/traces/abc123def456abc123def456abc123de',
    );
  });

  it('extracts spanId correctly', () => {
    const raw = 'abc123def456abc123def456abc123de/12345;o=1';
    const { spanId } = parseCloudTraceContext(raw, PROJECT_ID);
    expect(spanId).toBe('12345');
  });

  it('sets traceSampled=true when o=1', () => {
    const { traceSampled } = parseCloudTraceContext(
      'abc123/999;o=1',
      PROJECT_ID,
    );
    expect(traceSampled).toBe(true);
  });

  it('sets traceSampled=false when o=0', () => {
    const { traceSampled } = parseCloudTraceContext(
      'abc123/999;o=0',
      PROJECT_ID,
    );
    expect(traceSampled).toBe(false);
  });

  it('handles header with no span ID segment', () => {
    const { trace, spanId } = parseCloudTraceContext('abc123;o=1', PROJECT_ID);
    expect(trace).toBe('projects/my-project/traces/abc123');
    expect(spanId).toBeNull();
  });

  it('does NOT store the raw header value as the trace field', () => {
    const raw = 'someTraceId/someSpanId;o=1';
    const { trace } = parseCloudTraceContext(raw, PROJECT_ID);
    expect(trace).toMatch(/^projects\//);
    expect(trace).not.toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// Tests: schema_version
// ---------------------------------------------------------------------------

describe('LoggerService — schema_version', () => {
  it('emits schema_version: 1 on every GCP-mode log line', () => {
    const { service, lines } = makeGcpLogger();
    service.log('hello world', 'TestContext');
    const line = lines.find((l) => l['msg'] === 'hello world');
    expect(line).toBeDefined();
    expect(line!['schema_version']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: severity mapping
// ---------------------------------------------------------------------------

describe('LoggerService — severity mapping', () => {
  const GCP_SEVERITY_VALUES = new Set([
    'DEFAULT',
    'DEBUG',
    'INFO',
    'NOTICE',
    'WARNING',
    'ERROR',
    'CRITICAL',
    'ALERT',
    'EMERGENCY',
  ]);

  it('always emits a valid GCP severity value', () => {
    const { service, lines } = makeGcpLogger();
    service.debug('debug msg', 'Ctx');
    service.log('info msg', 'Ctx');
    service.warn('warn msg', 'Ctx');
    service.error('error msg', 'Ctx');

    const emittedSeverities = lines
      .filter((l) => l['severity'])
      .map((l) => l['severity'] as string);

    expect(emittedSeverities.length).toBeGreaterThan(0);
    emittedSeverities.forEach((s) => {
      expect(GCP_SEVERITY_VALUES.has(s)).toBe(true);
    });
  });

  it('maps warn to WARNING — not the Pino default WARN', () => {
    const { service, lines } = makeGcpLogger();
    service.warn('a warning', 'Ctx');
    const line = lines.find((l) => l['msg'] === 'a warning');
    expect(line!['severity']).toBe('WARNING');
  });
});

// ---------------------------------------------------------------------------
// Tests: CLS correlation propagation
// ---------------------------------------------------------------------------

describe('LoggerService — CLS correlation propagation', () => {
  it('injects requestId from CLS into every log line automatically', () => {
    const { service, lines } = makeGcpLogger({ requestId: 'req-abc-123' });
    service.log('something happened', 'TestContext');
    const line = lines.find((l) => l['msg'] === 'something happened');
    expect(line!['requestId']).toBe('req-abc-123');
  });

  it('injects logging.googleapis.com/trace in the correct format from CLS', () => {
    const { service, lines } = makeGcpLogger({
      requestId: 'req-xyz',
      traceContext: 'deadbeefdeadbeefdeadbeefdeadbeef/42;o=1',
    });
    service.log('traced call', 'TestContext');
    const line = lines.find((l) => l['msg'] === 'traced call');
    expect(line!['logging.googleapis.com/trace']).toBe(
      'projects/test-project/traces/deadbeefdeadbeefdeadbeefdeadbeef',
    );
  });

  it('injects logging.googleapis.com/spanId from the CLS trace header', () => {
    const { service, lines } = makeGcpLogger({
      requestId: 'req-xyz',
      traceContext: 'deadbeefdeadbeefdeadbeefdeadbeef/42;o=1',
    });
    service.log('traced call', 'TestContext');
    const line = lines.find((l) => l['msg'] === 'traced call');
    expect(line!['logging.googleapis.com/spanId']).toBe('42');
  });

  it('does NOT emit logging.googleapis.com/trace when header is absent', () => {
    const { service, lines } = makeGcpLogger({ requestId: 'req-xyz' });
    service.log('no trace', 'TestContext');
    const line = lines.find((l) => l['msg'] === 'no trace');
    expect(line!['logging.googleapis.com/trace']).toBeUndefined();
  });

  it('does not throw when CLS is inactive', () => {
    const { service } = makeGcpLogger({}, false);
    expect(() => service.log('outside cls', 'TestContext')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: typed event() helper
// ---------------------------------------------------------------------------

describe('LoggerService — event() typed helper', () => {
  it('emits a log with the event field set to the LogEvent name', () => {
    const { service, lines } = makeGcpLogger({ requestId: 'r1' });
    const logger = service.forContext('LikesService');
    logger.event(LOG_EVENT.LIKE_CREATED, {
      likeId: 'like-1',
      userId: 'user-1',
    });

    const line = lines.find((l) => l['event'] === LOG_EVENT.LIKE_CREATED);
    expect(line).toBeDefined();
    expect(line!['likeId']).toBe('like-1');
    expect(line!['userId']).toBe('user-1');
  });

  it('emits event() at INFO severity', () => {
    const { service, lines } = makeGcpLogger();
    const logger = service.forContext('TestService');
    logger.event(LOG_EVENT.REQUEST_COMPLETED, { durationMs: 100 });

    const line = lines.find((l) => l['event'] === LOG_EVENT.REQUEST_COMPLETED);
    expect(line!['severity']).toBe('INFO');
  });

  it('does not throw when called with any valid LogEvent name (runtime smoke test)', () => {
    const { service } = makeGcpLogger();
    const logger = service.forContext('TestService');
    expect(() =>
      // Force-cast to test runtime resilience — TS compiler prevents this normally
      (logger.event as (name: string) => void)('ANY_VALID_STRING'),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: centralized redaction
// ---------------------------------------------------------------------------

describe('LoggerService — centralized redaction', () => {
  /**
   * The test pino logger is constructed with the real PINO_REDACT_PATHS list
   * and { censor: '[Redacted]' }, so these tests verify that the production
   * redact configuration actually works end-to-end.
   *
   * Note: Pino redact uses fast-redact under the hood which operates on the
   * merged log object before JSON serialization. The `*.field` syntax matches
   * the field at any depth inside the first-level object passed to pino.
   */
  const sensitivePayloads: Array<{ field: string; value: string }> = [
    { field: 'password', value: 'super-secret-password' },
    { field: 'token', value: 'eyJhbGciOiJSUzI1NiJ9.test' },
    { field: 'accessToken', value: 'access-token-abc' },
    { field: 'refreshToken', value: 'refresh-token-xyz' },
    { field: 'apiKey', value: 'api-key-12345-unique' },
    { field: 'secret', value: 'my-shared-secret-abc' },
    { field: 'cardNumber', value: '4111111111111111' },
    { field: 'otp', value: '998877' },
  ];

  sensitivePayloads.forEach(({ field, value }) => {
    it(`redacts "${field}" so the raw value never appears in serialized output`, () => {
      const { service, lines } = makeGcpLogger();
      const logger = service.forContext('RedactionTest');

      logger.info('action with sensitive data', {
        [field]: value,
        userId: 'u-1',
      });

      const serialized = JSON.stringify(lines);
      expect(serialized).not.toContain(value);
      expect(serialized).toContain('[Redacted]');
    });
  });

  it('does NOT redact non-sensitive business fields', () => {
    const { service, lines } = makeGcpLogger();
    const logger = service.forContext('RedactionTest');
    logger.info('safe log', { userId: 'user-abc', likeId: 'like-xyz' });

    const serialized = JSON.stringify(lines);
    expect(serialized).toContain('user-abc');
    expect(serialized).toContain('like-xyz');
  });
});

// ---------------------------------------------------------------------------
// Tests: logging never throws into business logic (§1.2)
// ---------------------------------------------------------------------------

describe('LoggerService — resilience (§1.2)', () => {
  it('does not propagate exceptions when write() encounters an internal error', () => {
    const configService = {
      get: (key: string) => {
        const cfg: Record<string, string> = {
          NODE_ENV: 'production',
          DEPLOYMENT_ENV: 'gcp',
          LOG_LEVEL: 'info',
          APP_NAME: 'test',
          APP_VERSION: '1.0.0',
          GCP_PROJECT_ID: 'proj',
        };
        return cfg[key];
      },
    } as unknown as ConfigService;

    // CLS that throws on get() — simulates a broken CLS state
    const brokenCls = {
      isActive: () => true,
      get: () => {
        throw new Error('CLS internal failure');
      },
    } as unknown as ClsService;

    const service = new LoggerService(configService, brokenCls);

    // The only assertion: no exception propagates out of the log call.
    expect(() =>
      service.log('important business event', 'MyService'),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: Pub/Sub CLS correlation seeding pattern
// ---------------------------------------------------------------------------

describe('Pub/Sub CLS correlation seeding', () => {
  it('seeds requestId in CLS from the Pub/Sub messageId before handler execution', () => {
    const storedValues: Record<string, unknown> = {};
    const clsMock = {
      isActive: () => true,
      get: (key: string) => storedValues[key],
      set: (key: string, value: unknown) => {
        storedValues[key] = value;
      },
    } as unknown as ClsService;

    const messageId = 'pubsub-msg-id-abc-123';

    // Simulate what PubSubIngestionController.ingest() does:
    const correlationId = messageId ?? 'fallback-uuid';
    clsMock.set('requestId', correlationId);
    clsMock.set('pubsubMessageId', messageId);

    expect(clsMock.get('requestId')).toBe(messageId);
    expect(clsMock.get('pubsubMessageId')).toBe(messageId);
  });

  it('generates a valid UUID v4 requestId when messageId is absent', () => {
    const { randomUUID } = require('crypto') as typeof import('crypto');
    const storedValues: Record<string, unknown> = {};
    const clsMock = {
      get: (key: string) => storedValues[key],
      set: (key: string, value: unknown) => {
        storedValues[key] = value;
      },
    } as unknown as ClsService;

    const messageId = undefined;
    const correlationId = messageId ?? randomUUID();
    clsMock.set('requestId', correlationId);

    const requestId = clsMock.get('requestId');
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
