import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { RequestIdMiddleware } from '../../middlewares/request-id.middleware';
import { Request, Response, NextFunction } from 'express';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestIdMiddleware],
    }).compile();

    middleware = module.get<RequestIdMiddleware>(RequestIdMiddleware);

    mockRequest = {
      headers: {},
    };
    mockResponse = {};
    mockNext = jest.fn();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should accept valid request ID', () => {
      mockRequest.headers = {
        'x-request-id': 'req-123-abc',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['requestId']).toBe('req-123-abc');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-Request-ID header is missing', () => {
      mockRequest.headers = {};

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(new UnauthorizedException('X-Request-ID header is required'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-Request-ID is not a string', () => {
      mockRequest.headers = {
        'x-request-id': ['array-value'] as any,
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException('X-Request-ID header must be a string'),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should store request ID in request object', () => {
      const requestId = 'unique-request-id-123';
      mockRequest.headers = {
        'x-request-id': requestId,
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['requestId']).toBe(requestId);
    });
  });
});
