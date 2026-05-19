import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import { TimezoneUtil } from '@common/utils/timezone.utils';
import { TimezoneMiddleware } from '../../middlewares/timezone.middleware';

describe('TimezoneMiddleware', () => {
  let middleware: TimezoneMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimezoneMiddleware],
    }).compile();

    middleware = module.get<TimezoneMiddleware>(TimezoneMiddleware);

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
    it('should set timezone to UTC if x-timezone header is missing', () => {
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );
      expect(mockRequest['timezone']).toBe('UTC');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set timezone from a valid x-timezone header', () => {
      const timezone = 'America/New_York';
      mockRequest.headers = {
        'x-timezone': timezone,
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['timezone']).toBe(timezone);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle array of timezones and take the first one', () => {
      const timezone = 'Asia/Kolkata';
      mockRequest.headers = {
        'x-timezone': [timezone, 'America/Los_Angeles'],
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );
      expect(mockRequest['timezone']).toBe(timezone);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw BadRequestException for an invalid timezone', () => {
      const invalidTimezone = 'Invalid/Timezone';
      mockRequest.headers = {
        'x-timezone': invalidTimezone,
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new BadRequestException({
          message: 'Invalid timezone in header',
          details: `"${invalidTimezone}" is not a valid IANA timezone`,
          suggestion:
            'Use format like "Asia/Kolkata", "America/New_York", or omit for UTC',
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should normalize a valid timezone', () => {
      const timezone = 'asia/kolkata'; // Lowercase to test normalization
      mockRequest.headers = {
        'x-timezone': timezone,
      };

      // Mocking normalizeTimezone to ensure it's called and returns a normalized value
      const normalized = 'Asia/Kolkata';
      const spy = jest
        .spyOn(TimezoneUtil, 'normalizeTimezone')
        .mockReturnValue(normalized);

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(spy).toHaveBeenCalledWith(timezone);
      expect(mockRequest['timezone']).toBe(normalized);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
