/**
 * Centralized list of field paths that Pino must redact before serializing.
 *
 * Pino's \`redact\` option replaces matching values with \`[Redacted]\` at
 * serialization time — it is faster and more reliable than ad hoc manual
 * scrubbing at individual call-sites.
 *
 * **Path syntax rules:**
 * - Bare path \`fieldName\` — matches the field at the TOP LEVEL of the log object.
 * - Wildcard \`*.fieldName\` — matches the field inside any nested object.
 * - We include BOTH for each sensitive field to cover all call patterns.
 * - \`req.headers.authorization\` is a specific deep path for HTTP header redaction.
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
