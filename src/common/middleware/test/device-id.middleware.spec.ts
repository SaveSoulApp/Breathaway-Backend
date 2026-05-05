import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { DeviceIdMiddleware } from '../device-id.middleware';
import { Request, Response, NextFunction } from 'express';

describe('DeviceIdMiddleware', () => {
  let middleware: DeviceIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceIdMiddleware],
    }).compile();

    middleware = module.get<DeviceIdMiddleware>(DeviceIdMiddleware);

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
    it('should accept valid device ID', () => {
      mockRequest.headers = {
        'x-device-id': 'device-123-abc',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['deviceId']).toBe('device-123-abc');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-Device-ID header is missing', () => {
      mockRequest.headers = {};

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(new UnauthorizedException('X-Device-ID header is required'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-Device-ID is not a string', () => {
      mockRequest.headers = {
        'x-device-id': ['array-value'] as any,
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException('X-Device-ID header must be a string'),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should store device ID in request object', () => {
      const deviceId = 'my-device-uuid';
      mockRequest.headers = {
        'x-device-id': deviceId,
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['deviceId']).toBe(deviceId);
    });
  });
});
