import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { BasicAuthGuard } from '../../guards/basic-auth.guard';

describe('BasicAuthGuard', () => {
  let guard: BasicAuthGuard;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DEV_LOGIN_USERNAME') return 'admin';
      if (key === 'DEV_LOGIN_PASSWORD') return 'password';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BasicAuthGuard,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    guard = module.get<BasicAuthGuard>(BasicAuthGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true for valid credentials', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization:
              'Basic ' + Buffer.from('admin:password').toString('base64'),
          },
        }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException for missing header', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Missing Authorization Header'),
    );
  });

  it('should throw UnauthorizedException for invalid header format', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: 'Bearer token',
          },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid Authorization Header'),
    );
  });

  it('should throw UnauthorizedException for invalid credentials', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization:
              'Basic ' + Buffer.from('admin:wrong').toString('base64'),
          },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid Credentials'),
    );
  });

  it('should throw UnauthorizedException if config is missing', () => {
    mockConfigService.get.mockReturnValue(null);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization:
              'Basic ' + Buffer.from('admin:password').toString('base64'),
          },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid Credentials'),
    );
  });
});
