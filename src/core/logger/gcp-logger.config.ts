import { DateUtil } from '@common/utils/date.utils';
import * as pino from 'pino';

/**
 * Explicit mapping from Pino levels to GCP Cloud Logging LogSeverity enum.
 *
 * Do NOT use `label.toUpperCase()` — Pino's `warn` uppercases to `WARN`, which
 * Cloud Logging silently falls back to `DEFAULT` severity, breaking
 * severity-based alerting and log filters.
 *
 * Reference: https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
const PINO_LEVEL_TO_CLOUD_SEVERITY: Record<string, string> = {
  trace: 'DEFAULT',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/**
 * Centralized list of field paths that Pino must redact before serializing.
 *
 * Pino's `redact` option replaces matching values with `[Redacted]` at
 * serialization time — it is faster and more reliable than ad hoc manual
 * scrubbing at individual call-sites.
 *
 * **Path syntax rules:**
 * - Bare path `fieldName` — matches the field at the TOP LEVEL of the log object.
 * - Wildcard `*.fieldName` — matches the field inside any nested object.
 * - We include BOTH for each sensitive field to cover all call patterns.
 * - `req.headers.authorization` is a specific deep path for HTTP header redaction.
 *
 * Add new sensitive fields here; never scrub them at individual call-sites.
 */
export const PINO_REDACT_PATHS: string[] = [
  // Auth & credentials — top-level
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordConfirmation',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiKey',
  'apiSecret',
  'secret',
  'privateKey',

  // Auth & credentials — nested (e.g. inside a body/payload object)
  '*.password',
  '*.passwordConfirmation',
  '*.currentPassword',
  '*.newPassword',
  '*.confirmPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.apiKey',
  '*.apiSecret',
  '*.secret',
  '*.privateKey',

  // Payment & financial — top-level
  'cardNumber',
  'cvv',
  'cvc',
  'pan',
  'bankAccountNumber',
  'routingNumber',
  'iban',
  'swift',
  'paymentCredential',

  // Payment & financial — nested
  '*.cardNumber',
  '*.cvv',
  '*.cvc',
  '*.pan',
  '*.bankAccountNumber',
  '*.routingNumber',
  '*.iban',
  '*.swift',
  '*.paymentCredential',

  // PII — top-level
  'otp',
  'pin',
  'ssn',

  // PII — nested
  '*.otp',
  '*.pin',
  '*.ssn',
];

/**
 * Parses a raw `X-Cloud-Trace-Context` header value into its components.
 *
 * Header format: `TRACE_ID/SPAN_ID;o=SAMPLE_FLAG`
 * - `TRACE_ID` is a 32-hex-char UUID-like string.
 * - `SPAN_ID` is a decimal integer.
 * - `o=1` means the trace is sampled; `o=0` means not sampled.
 *
 * Returns `null` for both fields when the header is absent or malformed,
 * so callers can safely skip adding trace fields without crashing.
 */
export function parseCloudTraceContext(
  raw: string | undefined,
  projectId: string,
): { trace: string | null; spanId: string | null; traceSampled: boolean } {
  if (!raw) {
    return { trace: null, spanId: null, traceSampled: false };
  }

  // Example: "abc123def456abc123def456abc123de/12345;o=1"
  const [traceAndSpan, options] = raw.split(';');
  const parts = traceAndSpan?.split('/');
  const traceId = parts?.[0];
  const spanId = parts?.[1];
  const traceSampled = options === 'o=1';

  if (!traceId) {
    return { trace: null, spanId: null, traceSampled: false };
  }

  // GCP Cloud Logging requires the full resource path, not just the trace ID.
  // Omitting "projects/.../traces/" silently breaks trace linking in the UI.
  const trace = `projects/${projectId}/traces/${traceId}`;

  return { trace, spanId: spanId ?? null, traceSampled };
}

export const createGcpLoggerConfig = (
  logLevel: string,
  appName: string,
  appVersion: string,
  projectId: string,
): pino.LoggerOptions => ({
  level: logLevel,
  redact: {
    paths: PINO_REDACT_PATHS,
    censor: '[Redacted]',
  },
  formatters: {
    level: (label: string) => ({
      severity: PINO_LEVEL_TO_CLOUD_SEVERITY[label] || 'DEFAULT',
    }),
    bindings: (bindings) => ({
      ...bindings,
    }),
  },
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${DateUtil.now().toISOString()}"`,
  serializers: {
    error: pino.stdSerializers.err,
    req: (req: {
      method?: string;
      url?: string;
      remoteAddress?: string;
      remotePort?: number;
    }) => ({
      method: req.method,
      url: req.url,
      // Headers are intentionally omitted here — authorization headers are
      // already redacted via PINO_REDACT_PATHS, but serializing all headers
      // by default risks exposing other sensitive values.
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res: { statusCode?: number }) => ({
      statusCode: res.statusCode,
    }),
  },
  base: {
    // schema_version allows BigQuery table schema migrations without
    // breaking queries against historical data. Increment when the
    // log schema changes in a backward-incompatible way.
    schema_version: 1,
    serviceContext: {
      service: appName,
      version: appVersion,
    },
    // projectId is stored so log consumers can reconstruct the trace URL
    // without needing to look it up separately.
    gcpProjectId: projectId,
  },
});
