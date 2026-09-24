import { IncomingMessage, ServerResponse } from 'http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { applySwaggerBasicAuth } from '../swagger-basic-auth.config';

describe('applySwaggerBasicAuth', () => {
  let appMock: { use: jest.Mock };
  let configServiceMock: { getOrThrow: jest.Mock };
  let middleware: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;

  const validUser = 'docs_user';
  const validPass = 'docs_pass';

  beforeEach(() => {
    appMock = {
      use: jest.fn((fn) => {
        middleware = fn;
      }),
    };

    configServiceMock = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'SWAGGER_USERNAME') return validUser;
        if (key === 'SWAGGER_PASSWORD') return validPass;
        throw new Error(`Missing ${key}`);
      }),
    };

    applySwaggerBasicAuth(
      appMock as unknown as INestApplication,
      configServiceMock as unknown as ConfigService,
    );
  });

  it('should register middleware with app.use', () => {
    expect(appMock.use).toHaveBeenCalledTimes(1);
    expect(middleware).toBeDefined();
  });

  it('should call next() without auth check for non-swagger routes', () => {
    const nextMock = jest.fn();
    const req = { url: '/api/v1/users', headers: {} } as IncomingMessage;
    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    } as unknown as ServerResponse;

    middleware(req, res, nextMock);

    expect(nextMock).toHaveBeenCalledTimes(1);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('should block swagger route without credentials with 401 and WWW-Authenticate header', () => {
    const nextMock = jest.fn();
    const req = { url: '/api/public', headers: {} } as IncomingMessage;
    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    } as unknown as ServerResponse;

    middleware(req, res, nextMock);

    expect(nextMock).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(401, {
      'WWW-Authenticate': 'Basic realm="BreathAway API Docs", charset="UTF-8"',
      'Content-Type': 'text/plain',
    });
    expect(res.end).toHaveBeenCalledWith('Unauthorized');
  });

  it('should allow swagger route with valid credentials', () => {
    const nextMock = jest.fn();
    const base64 = Buffer.from(`${validUser}:${validPass}`).toString('base64');
    const req = {
      url: '/api/public/swagger-ui.css',
      headers: { authorization: `Basic ${base64}` },
    } as unknown as IncomingMessage;
    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    } as unknown as ServerResponse;

    middleware(req, res, nextMock);

    expect(nextMock).toHaveBeenCalledTimes(1);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('should reject swagger route with incorrect credentials', () => {
    const nextMock = jest.fn();
    const base64 = Buffer.from(`${validUser}:wrongpass`).toString('base64');
    const req = {
      url: '/api/admin-json',
      headers: { authorization: `Basic ${base64}` },
    } as unknown as IncomingMessage;
    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    } as unknown as ServerResponse;

    middleware(req, res, nextMock);

    expect(nextMock).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith('Unauthorized');
  });
});
