import axios from 'axios';
import { Prisma } from '@prisma/client';

/**
 * Regular expressions for detecting and redacting sensitive PII and authentication tokens
 * from error messages, URLs, stack traces, and audit log metadata (LOG-02, GDPR Art. 5(1)(c)).
 */
const SECRET_PARAM_REGEX =
  /([?&](?:password|token|access_token|refresh_token|secret|apiKey|api_key|key|auth|bearer|otp)=)[^&\s]+/gi;
const EMAIL_PARAM_REGEX = /([?&](?:email|mail)=)[^&\s]+/gi;
const PHONE_PARAM_REGEX = /([?&](?:phone|mobile|tel|contact)=)[^&\s]+/gi;
const BEARER_AUTH_REGEX = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const EMAIL_ADDRESS_REGEX =
  /[a-zA-Z0-9_.+-]+(?:@|%40)[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g;
const INTERNATIONAL_PHONE_REGEX =
  /(?:\+|%2B)[1-9]\d{0,3}[-.\s]*(?:\(?\d{2,5}\)?[-.\s]*)?\d{3,5}[-.\s]*\d{3,5}\b/g;
const LABELED_PHONE_REGEX =
  /(?<=(?:phone|mobile|tel|contact)[:=\s]+\s*)(?:\+?[0-9().-]{7,16}\b|\+?[0-9]{1,4}(?:[-.\s][0-9]{2,5}){1,4}\b)/gi;
const DELIMITED_PHONE_REGEX =
  /(?<![0-9a-zA-Z-])(?:\(?\d{3,5}\)?[-.\s]+)\d{3,5}[-.\s]+\d{3,5}\b/g;

/**
 * Normalized key names representing sensitive credentials, tokens, or personal identifiers
 * that must be censored in structured audit metadata objects.
 */
const SENSITIVE_KEY_SET = new Set([
  'password',
  'passwordconfirmation',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'apisecret',
  'secret',
  'privatekey',
  'cardnumber',
  'cvv',
  'cvc',
  'pan',
  'bankaccountnumber',
  'routingnumber',
  'iban',
  'swift',
  'paymentcredential',
  'otp',
  'pin',
  'ssn',
]);

/**
 * Audit actor identity keys that are explicitly authorized to appear in audit trails
 * and must not be stripped or masked by general PII scrubbing rules.
 */
const ALLOWED_AUDIT_ACTOR_KEYS = new Set([
  'adminemail',
  'adminemailhash',
  'adminsub',
  'userid',
  'actorid',
  'resourceid',
  'requestid',
  'useragent',
  'ipaddress',
  'actiontype',
]);

/**
 * Maximum string length processed by regex PII scrubbing to prevent ReDoS / CPU spikes (LOG-02).
 * Longer strings are truncated safely before regex substitution.
 */
const MAX_SCRUB_TEXT_LENGTH = 8192;

/**
 * Maximum recursion depth when sanitizing metadata structures.
 */
const MAX_SANITIZE_DEPTH = 8;

/**
 * Scrubs sensitive PII (emails, phone numbers, auth tokens, secrets in URLs) from text strings.
 * Used to sanitize error messages, stack traces, and query strings before logging or auditing.
 *
 * @param text - The raw text that may contain sensitive data.
 * @returns The sanitized text with PII replaced by redaction placeholders.
 */
export function scrubPii(text?: string | null): string {
  if (typeof text !== 'string' || !text) {
    return '';
  }

  const bounded =
    text.length > MAX_SCRUB_TEXT_LENGTH
      ? text.slice(0, MAX_SCRUB_TEXT_LENGTH) + '... [TRUNCATED]'
      : text;

  return bounded
    .replace(SECRET_PARAM_REGEX, (_match, prefix) => `${prefix}[REDACTED]`)
    .replace(EMAIL_PARAM_REGEX, (_match, prefix) => `${prefix}[REDACTED_EMAIL]`)
    .replace(PHONE_PARAM_REGEX, (_match, prefix) => `${prefix}[REDACTED_PHONE]`)
    .replace(BEARER_AUTH_REGEX, 'Bearer [REDACTED]')
    .replace(EMAIL_ADDRESS_REGEX, '[REDACTED_EMAIL]')
    .replace(INTERNATIONAL_PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(LABELED_PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(DELIMITED_PHONE_REGEX, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15
        ? '[REDACTED_PHONE]'
        : match;
    });
}

/**
 * Helper to determine if an unknown error object exhibits Axios-like error structure.
 */
function isAxiosLikeError(err: unknown): err is axios.AxiosError {
  if (axios.isAxiosError(err)) return true;
  if (!err || typeof err !== 'object') return false;
  const candidate = err as Record<string, unknown>;
  return Boolean(
    candidate.isAxiosError === true ||
    ('response' in candidate && 'config' in candidate),
  );
}

/**
 * Helper to determine if an object is an Axios response object (which carries circular request/socket graphs).
 */
function isAxiosResponse(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.status === 'number' &&
    'data' in obj &&
    'headers' in obj &&
    ('config' in obj || 'request' in obj)
  );
}

/**
 * Recursively sanitizes a value, scrubbing PII from strings, serializing embedded errors,
 * censoring sensitive credential keys, and defending against circular references.
 */
function sanitizeValue(
  val: unknown,
  keyName?: string,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (val === null || val === undefined) {
    return val;
  }

  // Prevent stack overflow and circular reference bypass at deep recursion levels
  if (depth > MAX_SANITIZE_DEPTH) {
    return typeof val === 'object' ? '[Truncated]' : val;
  }

  // Preserve Date instances as ISO strings
  if (val instanceof Date) {
    return val.toISOString();
  }

  // Preserve Buffers safely without decomposing into numeric index objects
  if (Buffer.isBuffer(val)) {
    return '[Binary Data]';
  }

  // Preserve authorized audit actor keys (e.g. adminEmail) without destructive regex replacement
  const normalizedKey = keyName?.toLowerCase().replace(/[^a-z]/g, '');
  if (normalizedKey && ALLOWED_AUDIT_ACTOR_KEYS.has(normalizedKey)) {
    return val;
  }

  // Censor known sensitive credential fields
  if (normalizedKey && SENSITIVE_KEY_SET.has(normalizedKey)) {
    return '[Redacted]';
  }

  // Serialize and scrub embedded Error instances
  if (val instanceof Error) {
    return serializeError(val, { scrubPii: true });
  }

  // Scrub strings (error messages, reasons, URLs, parameters)
  if (typeof val === 'string') {
    return scrubPii(val);
  }

  // Truncate non-serializable primitives and functions
  if (typeof val === 'function') {
    return '[Function]';
  }
  if (typeof val === 'symbol' || typeof val === 'bigint') {
    return val.toString();
  }

  // Handle arrays and objects with circular reference guard
  if (typeof val === 'object') {
    if (seen.has(val)) {
      return '[Circular]';
    }
    seen.add(val);

    // Guard against Node Streams, Sockets, and HTTP IncomingMessage/ClientRequest objects
    if (
      'pipe' in val &&
      typeof (val as { pipe?: unknown }).pipe === 'function'
    ) {
      return '[Stream]';
    }
    if ('socket' in val && 'incoming' in val) {
      return '[ServerResponse]';
    }

    if (Array.isArray(val)) {
      return val.map((item) => sanitizeValue(item, undefined, seen, depth + 1));
    }

    const result: Record<string, unknown> = {};
    try {
      for (const [k, v] of Object.entries(val)) {
        result[k] = sanitizeValue(v, k, seen, depth + 1);
      }
    } catch {
      return '[Unserializable]';
    }
    return result;
  }

  return val;
}

/**
 * Recursively sanitizes audit event metadata before writing to Google Cloud Pub/Sub and BigQuery (LOG-02).
 *
 * 1. Serializes and scrubs any embedded `Error` or exception objects via `serializeError()`.
 * 2. Redacts sensitive credentials (passwords, tokens, apiKeys, OTPs, card numbers) to `'[Redacted]'`.
 * 3. Scrubs unmasked email addresses, phone numbers, and secrets from all string values, reasons, or URLs.
 * 4. Preserves authorized audit trail identity fields (`adminEmail`, `adminEmailHash`, `requestId`, etc.).
 *
 * @param metadata - The arbitrary metadata object attached to an audit event.
 * @returns A clean, sanitized metadata object safe for long-term BigQuery retention.
 */
export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return metadata ?? undefined;
  }

  return sanitizeValue(metadata) as Record<string, unknown>;
}

/**
 * Standard shape of serialized, log-safe and audit-safe error objects (LOG-02).
 */
export interface SerializedError {
  message: string;
  name?: string;
  stack?: string;
  code?: string | number;
  httpStatus?: number;
  httpData?: unknown;
  meta?: unknown;
  clientVersion?: string;
  [key: string]: unknown;
}

/**
 * Serializes any thrown value into a consistent, log-safe and audit-safe shape.
 *
 * Automatically scrubs sensitive PII (emails, phone numbers, secrets in URLs) from error messages,
 * stack traces, and response data by default to prevent leakage into Cloud Logging and BigQuery (LOG-02).
 *
 * **Error type priority order:**
 * 1. `AxiosError` — HTTP client errors from external API calls (Instagram, Mailgun, Brevo).
 *    Only safe fields are captured; `config` is intentionally stripped because it contains
 *    `Authorization` headers and request body that may hold API keys or user PII.
 * 2. `PrismaClientKnownRequestError` — DB constraint errors. Captures `code` (e.g. "P2002"),
 *    `meta` (e.g. `{ target: ["email"] }` — which field violated the constraint), and
 *    `clientVersion` for schema drift diagnosis.
 * 3. Generic `Error` — captures `message`, `name`, `stack`, and any `code` property
 *    (covers Node.js `ErrnoException`: `ECONNREFUSED`, `ETIMEDOUT`, etc.).
 * 4. Plain objects — passed through with sensitive keys censored and string PII scrubbed.
 * 5. Primitives — stringified into `{ message }` with PII scrubbed.
 *
 * @param err - The thrown value. May be an Error subclass, a plain object, or a primitive.
 * @param options - Configuration options, including whether to enable PII scrubbing (defaults to `true`).
 * @returns A plain object safe to pass as structured log or audit metadata.
 */
export function serializeError(
  err: unknown,
  options?: { scrubPii?: boolean },
): SerializedError {
  const shouldScrub = options?.scrubPii ?? true;
  const scrubString = (str?: string | null) =>
    shouldScrub ? scrubPii(str) : (str ?? '');

  // 1. Axios HTTP client errors — strip config and request to prevent circular structures and credential/PII leakage
  if (isAxiosLikeError(err)) {
    const axiosErr = err;
    const responseData: unknown = axiosErr.response?.data;
    const serializedData: unknown =
      typeof responseData === 'string'
        ? scrubString(responseData)
        : typeof responseData === 'object' && responseData !== null
          ? sanitizeValue(responseData, undefined, new WeakSet())
          : responseData;

    const scrubbedMessage = scrubString(axiosErr.message);
    const scrubbedStack = axiosErr.stack
      ? scrubString(axiosErr.stack)
      : undefined;

    return {
      message: scrubbedMessage,
      name: axiosErr.name,
      stack: scrubbedStack,
      // Network-level error code (e.g. ECONNREFUSED, ETIMEDOUT, ERR_NETWORK)
      code: axiosErr.code,
      // Upstream HTTP response — already sanitized by the external API
      httpStatus: axiosErr.response?.status,
      httpData: serializedData,
      // config and request are intentionally omitted — they contain circular socket graphs,
      // ClientRequest, and Authorization headers that cause log-processor crashes.
    };
  }

  if (err instanceof Error) {
    const scrubbedMessage = scrubString(err.message);
    const scrubbedStack = err.stack ? scrubString(err.stack) : undefined;

    // 2. Prisma known request errors carry structured metadata beyond a plain stack trace.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        message: scrubbedMessage,
        name: err.name,
        stack: scrubbedStack,
        code: err.code,
        meta: shouldScrub && err.meta ? sanitizeValue(err.meta) : err.meta,
        clientVersion: err.clientVersion,
      };
    }

    // Inspect if generic Error carries an attached Axios response object
    const candidate = err as unknown as Record<string, unknown>;
    let httpStatus: number | undefined;
    let httpData: unknown;

    if (
      'response' in candidate &&
      candidate.response &&
      typeof candidate.response === 'object'
    ) {
      const resp = candidate.response as Record<string, unknown>;
      if (typeof resp.status === 'number') {
        httpStatus = resp.status;
      }
      if ('data' in resp) {
        httpData = sanitizeValue(resp.data, undefined, new WeakSet());
      }
    }

    // 3. Generic Error — covers Node.js ErrnoException (ECONNREFUSED, ETIMEDOUT, etc.)
    return {
      message: scrubbedMessage,
      name: err.name,
      stack: scrubbedStack,
      ...('code' in err && err.code !== undefined
        ? { code: (err as NodeJS.ErrnoException).code }
        : {}),
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(httpData !== undefined ? { httpData } : {}),
    };
  }

  // 4. Plain objects (e.g. thrown Axios response objects or { code, message } shapes from legacy SDK wrappers)
  if (typeof err === 'object' && err !== null) {
    // Defend against thrown raw Axios response objects carrying circular request graphs
    if (isAxiosResponse(err)) {
      const resp = err as {
        status?: number;
        statusText?: string;
        data?: unknown;
      };
      return {
        message:
          typeof resp.statusText === 'string' && resp.statusText
            ? scrubString(resp.statusText)
            : `HTTP ${resp.status ?? 'Error'}`,
        httpStatus: resp.status,
        httpData: sanitizeValue(resp.data, undefined, new WeakSet()),
      };
    }

    const sanitizedObj = sanitizeValue(err, undefined, new WeakSet());
    const obj =
      typeof sanitizedObj === 'object' && sanitizedObj !== null
        ? (sanitizedObj as Record<string, unknown>)
        : {};
    return {
      message: typeof obj.message === 'string' ? obj.message : '',
      ...obj,
    };
  }

  // 5. Primitives
  return { message: scrubString(String(err)) };
}
