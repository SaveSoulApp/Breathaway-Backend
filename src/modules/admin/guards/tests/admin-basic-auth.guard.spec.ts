import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { AdminBasicAuthGuard } from '../admin-basic-auth.guard';
import { AdminOidcAuthGuard } from '../admin-oidc-auth.guard';

describe('AdminBasicAuthGuard', () => {
  let guard: AdminBasicAuthGuard;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBasicAuthGuard,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ClsService, useValue: { set: jest.fn(), get: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    guard = module.get<AdminBasicAuthGuard>(AdminBasicAuthGuard);
  });

  it('should be defined and inherit from AdminOidcAuthGuard', () => {
    expect(guard).toBeDefined();
    expect(guard).toBeInstanceOf(AdminOidcAuthGuard);
  });
});
