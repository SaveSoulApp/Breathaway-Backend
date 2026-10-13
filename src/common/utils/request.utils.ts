/**
 * Normalizes an IP string by trimming whitespace and stripping any trailing port suffix.
 * Handles IPv4 ("203.0.113.195:443" -> "203.0.113.195") and bracketed IPv6 ("[2001:db8::1]:8080" -> "2001:db8::1").
 *
 * @param ip - Raw IP string potentially with port or surrounding whitespace.
 * @returns Clean IP string, or undefined if invalid or empty.
 */
function cleanIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const trimmed = ip.trim();
  if (!trimmed) return undefined;

  // Bracketed IPv6 with optional port: [2001:db8::1]:8080 or [2001:db8::1]
  if (trimmed.startsWith('[')) {
    const closeBracketIndex = trimmed.indexOf(']');
    if (closeBracketIndex !== -1) {
      return trimmed.slice(1, closeBracketIndex);
    }
  }

  // IPv4 with port: 192.168.1.1:8080
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(trimmed)) {
    return trimmed.split(':')[0];
  }

  return trimmed;
}

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
  if (req.ip) {
    const cleanedExpressIp = cleanIp(req.ip);
    if (cleanedExpressIp) return cleanedExpressIp;
  }

  // 2. Direct socket address when no forwarding proxy headers exist
  const forwarded = req.headers?.['x-forwarded-for'];
  const realIp = req.headers?.['x-real-ip'];

  if (!forwarded && !realIp && req.socket?.remoteAddress) {
    return cleanIp(req.socket.remoteAddress);
  }

  // 3. Reverse-proxy header extraction (rightmost IP in the chain)
  if (forwarded) {
    const rawList = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    if (typeof rawList === 'string' && rawList.length > 0) {
      const parts = rawList
        .split(',')
        .map((entry) => cleanIp(entry))
        .filter((entry): entry is string => Boolean(entry && entry.length > 0));

      const clientIp = parts[parts.length - 1];
      if (clientIp) return clientIp;
    }
  }

  // 4. X-Real-IP fallback
  if (typeof realIp === 'string' && realIp.length > 0) {
    const cleanedRealIp = cleanIp(realIp);
    if (cleanedRealIp) return cleanedRealIp;
  }

  // 5. Final fallback to socket remote address
  return cleanIp(req.socket?.remoteAddress);
}
