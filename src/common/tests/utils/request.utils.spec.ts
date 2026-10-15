import { extractClientIp } from '@common/utils/request.utils';

describe('extractClientIp', () => {
  it('should return undefined if req is undefined', () => {
    expect(extractClientIp(undefined as unknown as any)).toBeUndefined();
  });

  it('should prioritize CF-Connecting-IP when present', () => {
    const req = {
      headers: {
        'cf-connecting-ip': '49.43.243.125',
        'x-real-ip': '198.51.100.1',
        'x-forwarded-for': '203.0.113.195',
      },
      ip: '10.0.0.1',
    };
    expect(extractClientIp(req)).toBe('49.43.243.125');
  });

  it('should prioritize X-Real-IP over X-Forwarded-For when CF-Connecting-IP is absent', () => {
    const req = {
      headers: {
        'x-real-ip': '49.43.243.125',
        'x-forwarded-for': '203.0.113.195, 44.192.105.200',
      },
    };
    expect(extractClientIp(req)).toBe('49.43.243.125');
  });

  it('should extract originating client IP (first public IP) from multi-hop X-Forwarded-For chain (Vercel to Cloud Run scenario)', () => {
    const req = {
      headers: {
        'x-forwarded-for': '49.43.243.125, 44.192.105.200',
      },
    };
    expect(extractClientIp(req)).toBe('49.43.243.125');
  });

  it('should skip internal link-local or loopback proxy hops at the front of X-Forwarded-For', () => {
    const req = {
      headers: {
        'x-forwarded-for': '169.254.1.1, 49.43.243.125, 44.192.105.200',
      },
    };
    expect(extractClientIp(req)).toBe('49.43.243.125');
  });

  it('should extract client IP from array X-Forwarded-For header', () => {
    const req = {
      headers: {
        'x-forwarded-for': ['49.43.243.125, 44.192.105.200'],
      },
    };
    expect(extractClientIp(req)).toBe('49.43.243.125');
  });

  it('should fallback to first entry when all entries in X-Forwarded-For are internal (e.g. local dev / testing)', () => {
    const req = {
      headers: {
        'x-forwarded-for': '127.0.0.1, 10.0.0.1',
      },
    };
    expect(extractClientIp(req)).toBe('127.0.0.1');
  });

  it('should fallback to req.ip when headers are missing', () => {
    const req = {
      headers: {},
      ip: '10.0.0.4',
    };
    expect(extractClientIp(req)).toBe('10.0.0.4');
  });

  it('should fallback to req.socket.remoteAddress when req.ip and headers are missing', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    expect(extractClientIp(req)).toBe('127.0.0.1');
  });

  it('should strip IPv4 port numbers from X-Forwarded-For', () => {
    const req = {
      headers: {
        'x-forwarded-for': '49.43.243.125:443, 44.192.105.200:8080',
      },
    };
    expect(extractClientIp(req)).toBe('49.43.243.125');
  });

  it('should strip IPv4 port numbers from req.ip', () => {
    const req = {
      headers: {},
      ip: '203.0.113.195:443',
    };
    expect(extractClientIp(req)).toBe('203.0.113.195');
  });

  it('should strip bracketed IPv6 port numbers', () => {
    const req = {
      headers: {
        'x-forwarded-for': '[2001:db8::1]:8080',
      },
    };
    expect(extractClientIp(req)).toBe('2001:db8::1');
  });

  it('should handle sparse arrays and empty elements in X-Forwarded-For', () => {
    const req = {
      headers: {
        'x-forwarded-for': ['', '   ', '203.0.113.195'],
      },
    };
    expect(extractClientIp(req)).toBe('203.0.113.195');
  });
});
