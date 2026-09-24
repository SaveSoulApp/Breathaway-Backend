import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { createMockExecutionContext } from '@common/tests/mocks/execution-context.mock';

import { AdminBasicAuthGuard } from '../admin-basic-auth.guard';

describe('AdminBasicAuthGuard', () => {
  let guard: AdminBasicAuthGuard;

  const validUser = 'adminuser';
  const validPass = 'adminpass';

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'ADMIN_USERNAME') return validUser;
      if (key === 'ADMIN_PASSWORD') return validPass;
      throw new Error(`Missing config: ${key}`);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBasicAuthGuard,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<AdminBasicAuthGuard>(AdminBasicAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true for valid admin credentials', () => {
    // Arrange
    const base64 = Buffer.from(`${validUser}:${validPass}`).toString('base64');
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: { authorization: `Basic ${base64}` } },
      { setHeader: setHeaderMock },
    );

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(setHeaderMock).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException and set WWW-Authenticate header when header is missing', () => {
    // Arrange
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: {} },
      { setHeader: setHeaderMock },
    );

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="BreathAway Admin API", charset="UTF-8"',
    );
  });

  it('should throw UnauthorizedException when header does not start with Basic ', () => {
    // Arrange
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: { authorization: 'Bearer token123' } },
      { setHeader: setHeaderMock },
    );

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="BreathAway Admin API", charset="UTF-8"',
    );
  });

  it('should throw UnauthorizedException when decoded credentials lack a colon separator', () => {
    // Arrange
    const base64NoColon = Buffer.from('justusername').toString('base64');
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: { authorization: `Basic ${base64NoColon}` } },
      { setHeader: setHeaderMock },
    );

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeaderMock).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when username does not match', () => {
    // Arrange
    const base64 = Buffer.from(`wronguser:${validPass}`).toString('base64');
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: { authorization: `Basic ${base64}` } },
      { setHeader: setHeaderMock },
    );

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeaderMock).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when password does not match', () => {
    // Arrange
    const base64 = Buffer.from(`${validUser}:wrongpass`).toString('base64');
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: { authorization: `Basic ${base64}` } },
      { setHeader: setHeaderMock },
    );

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeaderMock).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when username has different length', () => {
    // Arrange
    const base64 = Buffer.from(`short:${validPass}`).toString('base64');
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: { authorization: `Basic ${base64}` } },
      { setHeader: setHeaderMock },
    );

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeaderMock).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when password has different length', () => {
    // Arrange
    const base64 = Buffer.from(`${validUser}:short`).toString('base64');
    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      { headers: { authorization: `Basic ${base64}` } },
      { setHeader: setHeaderMock },
    );

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeaderMock).toHaveBeenCalled();
  });
});
