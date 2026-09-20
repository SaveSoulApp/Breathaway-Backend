import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { OptionalJwtAuthGuard } from '../../guards/optional-jwt-auth.guard';

describe(OptionalJwtAuthGuard.name, () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        OptionalJwtAuthGuard,
      ],
    }).compile();

    guard = module.get<OptionalJwtAuthGuard>(OptionalJwtAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should implement canActivate function', () => {
    expect(typeof guard.canActivate === 'function').toBe(true);
  });

  describe('handleRequest', () => {
    const mockContext = {} as ExecutionContext;

    it('should return user when user payload is provided', () => {
      const mockUser = { userId: 'user-123', email: 'user@example.com' };

      const result = guard.handleRequest(null, mockUser, null, mockContext);

      expect(result).toEqual(mockUser);
    });

    it('should return null when user is falsy (no token)', () => {
      const result = guard.handleRequest(
        null,
        false,
        { message: 'No auth token' },
        mockContext,
      );

      expect(result).toBeNull();
    });

    it('should return null without throwing when error is provided (invalid/expired token)', () => {
      const result = guard.handleRequest(
        new Error('jwt expired'),
        false,
        null,
        mockContext,
      );

      expect(result).toBeNull();
    });
  });
});
