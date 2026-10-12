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

  return text
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
 * Recursively sanitizes a value, scrubbing PII from strings, serializing embedded errors,
 * and censoring sensitive credential keys.
 */
function sanitizeValue(val: unknown, keyName?: string): unknown {
  if (val === null || val === undefined) {
    return val;
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

  // Recurse on arrays
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item));
  }

  // Recurse on plain objects
  if (typeof val === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = sanitizeValue(v, k);
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
): Record<string, unknown> {
  const shouldScrub = options?.scrubPii ?? true;
  const scrubString = (str?: string | null) =>
    shouldScrub ? scrubPii(str) : (str ?? '');

  // 1. Axios HTTP client errors — strip config to prevent credential/PII leakage
  if (axios.isAxiosError(err)) {
    const responseData: unknown = err.response?.data;
    const serializedData: unknown =
      typeof responseData === 'string'
        ? scrubString(responseData)
        : typeof responseData === 'object' && responseData !== null
          ? (sanitizeValue(responseData) as Record<string, unknown>)
          : responseData;

    const scrubbedMessage = scrubString(err.message);
    const scrubbedStack =
      shouldScrub && err.stack
        ? err.message && scrubbedMessage !== err.message
          ? err.stack.replace(err.message, scrubbedMessage)
          : err.stack
        : err.stack;

    return {
      message: scrubbedMessage,
      name: err.name,
      stack: scrubbedStack,
      // Network-level error code (e.g. ECONNREFUSED, ETIMEDOUT, ERR_NETWORK)
      code: err.code,
      // Upstream HTTP response — already sanitized by the external API
      httpStatus: err.response?.status,
      httpData: serializedData,
      // config is intentionally omitted — it contains Authorization headers,
      // API keys, and request body which may hold credentials or user PII.
    };
  }

  if (err instanceof Error) {
    const scrubbedMessage = scrubString(err.message);
    const scrubbedStack =
      shouldScrub && err.stack
        ? err.message && scrubbedMessage !== err.message
          ? err.stack.replace(err.message, scrubbedMessage)
          : err.stack
        : err.stack;

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

    // 3. Generic Error — covers Node.js ErrnoException (ECONNREFUSED, ETIMEDOUT, etc.)
    return {
      message: scrubbedMessage,
      name: err.name,
      stack: scrubbedStack,
      ...('code' in err && err.code !== undefined
        ? { code: (err as NodeJS.ErrnoException).code }
        : {}),
    };
  }

  // 4. Plain objects (e.g. thrown { code, message } shapes from legacy SDK wrappers)
  if (typeof err === 'object' && err !== null) {
    return shouldScrub
      ? (sanitizeValue(err) as Record<string, unknown>)
      : (err as Record<string, unknown>);
  }

  // 5. Primitives
  return { message: scrubString(String(err)) };
}
