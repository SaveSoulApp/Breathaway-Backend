import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

describe(JwtAuthGuard.name, () => {
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should implement AAA pattern in tests (canActivate)', () => {
    // Arrange
    // Act
    // Inherited from passport-jwt which wraps ExecutionContext in Express Request context.
    const result = typeof guard.canActivate === 'function';

    // Assert
    expect(result).toBe(true);
  });
});
