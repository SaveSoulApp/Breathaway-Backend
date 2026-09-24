import { BadRequestException } from '@nestjs/common';

import { RequireTimezoneGuard } from '../../guards/require-timezone.guard';
import { createMockExecutionContext } from '../mocks/execution-context.mock';

describe('RequireTimezoneGuard', () => {
  let guard: RequireTimezoneGuard;

  beforeEach(() => {
    guard = new RequireTimezoneGuard();
  });

  it('should return true when x-timezone header is present', () => {
    // Arrange
    const context = createMockExecutionContext({
      headers: {
        'x-timezone': 'Asia/Kolkata',
      },
    });

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should throw BadRequestException when x-timezone header is missing', () => {
    // Arrange
    const context = createMockExecutionContext({
      headers: {},
    });

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
  });
});
