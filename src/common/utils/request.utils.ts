/**
 * Extracts the verified public client IP address from an incoming HTTP request.
 *
 * In GCP Cloud Run and serverless reverse-proxy environments, Express is configured
 * with `trust proxy: 1` to trust the immediate Google Cloud frontend proxy hop.
 * Express natively resolves `req.ip` from `X-Forwarded-For` from right to left,
 * stripping trusted proxy hops and preventing client IP spoofing (SEC-07).
 *
 * Priority order:
 * 1. `req.ip`: The Express-calculated IP adhering to trusted proxy hop configurations.
 * 2. `X-Forwarded-For`: For non-Express or raw requests, extracts the rightmost IP
 *    (the IP appended by the trusted reverse proxy) rather than client-manipulable leftmost entries.
 * 3. `X-Real-IP`: Fallback proxy header.
 * 4. `req.socket.remoteAddress`: Direct TCP connection address.
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

  // 1. Prefer Express's trusted proxy-resolved IP
  if (req.ip) return req.ip;

  // 2. Direct socket address when no forwarding proxy headers exist
  const forwarded = req.headers?.['x-forwarded-for'];
  const realIp = req.headers?.['x-real-ip'];

  if (!forwarded && !realIp && req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }

  // 3. Reverse-proxy header extraction (rightmost IP in the chain)
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const parts = forwarded
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const clientIp = parts[parts.length - 1];
    if (clientIp) return clientIp;
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    const lastEntry = forwarded[forwarded.length - 1];
    if (lastEntry) {
      const parts = lastEntry
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      const clientIp = parts[parts.length - 1];
      if (clientIp) return clientIp;
    }
  }

  // 4. X-Real-IP fallback
  if (typeof realIp === 'string' && realIp.length > 0) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }

  // 5. Final fallback to socket remote address
  return req.socket?.remoteAddress;
}
