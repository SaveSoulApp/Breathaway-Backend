import { extractClientIp } from '@common/utils/request.utils';

describe('extractClientIp', () => {
  it('should return undefined if req is undefined', () => {
    expect(extractClientIp(undefined as unknown as any)).toBeUndefined();
  });

  it('should extract leftmost IP from string x-forwarded-for header', () => {
    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
    };
    expect(extractClientIp(req)).toBe('203.0.113.195');
  });

  it('should extract leftmost IP from array x-forwarded-for header', () => {
    const req = {
      headers: {
        'x-forwarded-for': ['198.51.100.1, 10.0.0.1'],
      },
    };
    expect(extractClientIp(req)).toBe('198.51.100.1');
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
});
