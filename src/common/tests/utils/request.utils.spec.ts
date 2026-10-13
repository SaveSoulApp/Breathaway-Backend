import { extractClientIp } from '@common/utils/request.utils';

describe('extractClientIp', () => {
  it('should return undefined if req is undefined', () => {
    expect(extractClientIp(undefined as unknown as any)).toBeUndefined();
  });

  it('should prioritize Express trusted req.ip over proxy headers', () => {
    const req = {
      ip: '203.0.113.195',
      headers: {
        'x-forwarded-for': 'spoofed.ip.1, spoofed.ip.2',
      },
    };
    expect(extractClientIp(req)).toBe('203.0.113.195');
  });

  it('should extract trusted rightmost IP from string x-forwarded-for header when req.ip is not set', () => {
    const req = {
      headers: {
        'x-forwarded-for': 'spoofed.ip.1, 70.41.3.18, 203.0.113.195',
      },
    };
    expect(extractClientIp(req)).toBe('203.0.113.195');
  });

  it('should extract trusted rightmost IP from array x-forwarded-for header when req.ip is not set', () => {
    const req = {
      headers: {
        'x-forwarded-for': ['spoofed.ip.1, 198.51.100.1'],
      },
    };
    expect(extractClientIp(req)).toBe('198.51.100.1');
  });

  it('should prevent IP spoofing when an attacker prepends fake IP to x-forwarded-for (SEC-07)', () => {
    const req = {
      headers: {
        'x-forwarded-for': '1.2.3.4, 49.37.152.20',
      },
    };
    expect(extractClientIp(req)).toBe('49.37.152.20');
  });

  it('should fallback to x-real-ip when x-forwarded-for is missing', () => {
    const req = {
      headers: {
        'x-real-ip': '192.0.2.1',
      },
    };
    expect(extractClientIp(req)).toBe('192.0.2.1');
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

  it('should strip IPv4 port numbers from x-forwarded-for', () => {
    const req = {
      headers: {
        'x-forwarded-for': '10.0.0.1:8080, 203.0.113.195:443',
      },
    };
    expect(extractClientIp(req)).toBe('203.0.113.195');
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

  it('should handle sparse arrays and empty elements in x-forwarded-for', () => {
    const req = {
      headers: {
        'x-forwarded-for': ['203.0.113.195', '', '   '],
      },
    };
    expect(extractClientIp(req)).toBe('203.0.113.195');
  });
});
