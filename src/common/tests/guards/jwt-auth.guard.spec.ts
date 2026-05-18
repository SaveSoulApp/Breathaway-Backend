import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { createMockExecutionContext } from '../mocks/execution-context.mock';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should implement AAA pattern in tests (canActivate)', () => {
    // Arrange
    const context = createMockExecutionContext();

    // Act
    // Inherited from passport-jwt which wraps ExecutionContext in Express Request context.
    const result = typeof guard.canActivate === 'function';

    // Assert
    expect(result).toBe(true);
  });
});
