import { MiddlewareConsumer } from '@nestjs/common';

import { configureMiddleware } from '../../middlewares/middleware.config';
import { RequestIdMiddleware } from '../../middlewares/request-id.middleware';
import { TimezoneMiddleware } from '../../middlewares/timezone.middleware';

describe('configureMiddleware', () => {
  it('should apply RequestIdMiddleware and TimezoneMiddleware with proper exclusions for all routes', () => {
    // Arrange
    const forRoutesMock = jest.fn().mockReturnThis();
    const excludeMock = jest.fn().mockReturnValue({
      forRoutes: forRoutesMock,
    });
    const applyMock = jest.fn().mockReturnValue({
      exclude: excludeMock,
    });

    const consumerMock: MiddlewareConsumer = {
      apply: applyMock,
    };

    // Act
    configureMiddleware(consumerMock);

    // Assert
    expect(applyMock).toHaveBeenCalledWith(
      RequestIdMiddleware,
      TimezoneMiddleware,
    );
    expect(excludeMock).toHaveBeenCalled();
    expect(forRoutesMock).toHaveBeenCalledWith('*');
  });
});
