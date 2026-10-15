/**
 * Checks whether the given IP is a loopback, link-local, private, or reserved address.
 *
 * Used to skip internal infrastructure proxies (e.g. Google Front End link-local
 * hops or VPC private hops) when inspecting proxy forwarding chains.
 *
 * @param ip - Normalized IP address.
 * @returns True if the IP is internal, link-local, or private.
 */
function isInternalOrLinkLocal(ip: string): boolean {
  // Loopback IPv4 & IPv6
  if (ip === 'localhost' || ip === '::1' || ip.startsWith('127.')) {
    return true;
  }

  // IPv6 link-local and unique local addresses
  if (
    ip.startsWith('fe80:') ||
    ip.startsWith('fc00:') ||
    ip.startsWith('fd00:')
  ) {
    return true;
  }

  // IPv4 private ranges (RFC 1918) and link-local (RFC 3927)
  // 10.0.0.0/8
  if (ip.startsWith('10.')) {
    return true;
  }

  // 192.168.0.0/16
  if (ip.startsWith('192.168.')) {
    return true;
  }

  // 169.254.0.0/16 (Link-local, including GCP/AWS metadata & router addresses)
  if (ip.startsWith('169.254.')) {
    return true;
  }

  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = Number(parts[1]);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }

  // Unspecified address
  if (ip === '0.0.0.0' || ip === '::') {
    return true;
  }

  return false;
}

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
 * In GCP Cloud Run, Vercel, and reverse-proxy environments, the client's public IP address
 * is transmitted through forwarding headers.
 *
 * Priority order:
 * 1. `CF-Connecting-IP`: Cloudflare authoritative client IP.
 * 2. `X-Real-IP`: Provided by reverse proxies (Vercel, Nginx, ALB) indicating the real client.
 * 3. `X-Forwarded-For`: Standard proxy forwarding header (`<client>, <proxy1>, <proxy2>...`).
 *    Extracts the first valid public IP in the chain (skipping internal link-local/private proxy hops).
 * 4. `req.ip`: Express-calculated IP adhering to trusted proxy configurations.
 * 5. `req.socket.remoteAddress`: Direct TCP connection address.
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

  // 1. Cloudflare authoritative connecting IP
  const cfIp = Array.isArray(req.headers?.['cf-connecting-ip'])
    ? req.headers?.['cf-connecting-ip'][0]
    : req.headers?.['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.length > 0) {
    const cleaned = cleanIp(cfIp);
    if (cleaned) return cleaned;
  }

  // 2. X-Real-IP header from upstream reverse proxy (Vercel, Nginx, ALB)
  const realIp = Array.isArray(req.headers?.['x-real-ip'])
    ? req.headers?.['x-real-ip'][0]
    : req.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    const cleaned = cleanIp(realIp);
    if (cleaned) return cleaned;
  }

  // 3. X-Forwarded-For: leftmost public IP is the originating client (RFC 7239)
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const rawList = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    if (typeof rawList === 'string' && rawList.length > 0) {
      const parts = rawList
        .split(',')
        .map((entry) => cleanIp(entry))
        .filter((entry): entry is string => Boolean(entry && entry.length > 0));

      // Prefer the first public/routable client IP; fallback to the first entry if all are internal
      const clientIp =
        parts.find((ip) => !isInternalOrLinkLocal(ip)) ?? parts[0];
      if (clientIp) return clientIp;
    }
  }

  // 4. Express trusted proxy-resolved IP
  if (req.ip) {
    const cleanedExpressIp = cleanIp(req.ip);
    if (cleanedExpressIp) return cleanedExpressIp;
  }

  // 5. Final fallback to socket remote address
  return cleanIp(req.socket?.remoteAddress);
}
