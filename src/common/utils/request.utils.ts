/**
 * Extracts the public client IP address from an incoming HTTP request.
 *
 * In GCP Cloud Run and environments behind Google Cloud Load Balancing or reverse proxies,
 * the client's public IP address is provided as the first (leftmost) entry in the
 * `X-Forwarded-For` request header. Falls back to `X-Real-IP`, `req.ip`, or `req.socket.remoteAddress`.
 *
 * @param req - The Express or raw HTTP request object.
 * @returns The resolved client IP string, or `undefined` if not detectable.
 */
export function extractClientIp(req: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string | undefined {
  if (!req) return undefined;

  const forwarded = req.headers?.['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const clientIp = forwarded.split(',')[0].trim();
    if (clientIp) return clientIp;
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    const clientIp = forwarded[0]?.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  const realIp = req.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }

  return req.ip || req.socket?.remoteAddress;
}
