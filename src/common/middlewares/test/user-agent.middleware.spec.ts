import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserAgentMiddleware } from '../user-agent.middleware';
import { Request, Response, NextFunction } from 'express';

describe('UserAgentMiddleware', () => {
  let middleware: UserAgentMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockConfigService: any;

  beforeEach(async () => {
    // Create fresh mock for each test
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config = {
          APP_NAME: 'BreathAway',
          REQUIRED_PLATFORMS: '["iOS","Android"]',
          MIN_APP_VERSION: '1.0.0',
        };
        return config[key] || defaultValue;
      }),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAgentMiddleware,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    middleware = module.get<UserAgentMiddleware>(UserAgentMiddleware);

    mockRequest = {
      headers: {},
    };
    mockResponse = {};
    mockNext = jest.fn();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('initialization', () => {
    it('should parse platforms from JSON array', () => {
      mockConfigService.get.mockImplementation((key, defaultValue) => {
        if (key === 'REQUIRED_PLATFORMS') return '["iOS","Android"]';
        if (key === 'APP_NAME') return 'BreathAway';
        if (key === 'MIN_APP_VERSION') return '1.0.0';
        return defaultValue;
      });

      const middleware = new UserAgentMiddleware(mockConfigService as any);
      expect(middleware).toBeDefined();
    });

    it('should fallback to comma-separated parsing for invalid JSON', () => {
      mockConfigService.get.mockImplementation((key, defaultValue) => {
        if (key === 'REQUIRED_PLATFORMS') return 'iOS,Android';
        if (key === 'APP_NAME') return 'BreathAway';
        if (key === 'MIN_APP_VERSION') return '1.0.0';
        return defaultValue;
      });

      const middleware = new UserAgentMiddleware(mockConfigService as any);
      expect(middleware).toBeDefined();
    });

    it('should throw error when no valid platforms configured', () => {
      mockConfigService.get.mockImplementation((key, defaultValue) => {
        if (key === 'REQUIRED_PLATFORMS') return '[]';
        if (key === 'APP_NAME') return 'BreathAway';
        if (key === 'MIN_APP_VERSION') return '1.0.0';
        return defaultValue;
      });

      expect(() => {
        new UserAgentMiddleware(mockConfigService as any);
      }).toThrow('No valid platforms configured');
    });

    it('should use default values', () => {
      mockConfigService.get.mockImplementation((key, defaultValue) => {
        return defaultValue;
      });

      const middleware = new UserAgentMiddleware(mockConfigService as any);
      expect(middleware).toBeDefined();
    });
  });

  describe('use', () => {
    it('should accept valid iOS user agent', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/1.2.0 (iOS 16.0; iPhone14,2)',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['userAgentData']).toEqual({
        appName: 'BreathAway',
        version: '1.2.0',
        platform: 'iOS',
        osVersion: '16.0',
        deviceModel: 'iPhone14,2',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept valid Android user agent', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/2.0.0 (Android 13; Pixel 7)',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['userAgentData']).toEqual({
        appName: 'BreathAway',
        version: '2.0.0',
        platform: 'Android',
        osVersion: '13',
        deviceModel: 'Pixel 7',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when User-Agent is missing', () => {
      mockRequest.headers = {};

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(new UnauthorizedException('User-Agent header is required'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when User-Agent is not a string', () => {
      mockRequest.headers = {
        'user-agent': ['array-value'] as any,
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException('User-Agent header must be a string'),
      );
    });

    it('should throw UnauthorizedException for invalid format', () => {
      mockRequest.headers = {
        'user-agent': 'InvalidFormat',
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException(
          'User-Agent must follow format: BreathAway/Version (Platform OSVersion; DeviceModel)',
        ),
      );
    });

    it('should throw UnauthorizedException for invalid platform', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/1.0.0 (Windows 11; Desktop)',
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException(
          'Invalid platform. Supported platforms: iOS, Android',
        ),
      );
    });

    it('should throw UnauthorizedException for version too old (major)', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/0.9.0 (iOS 16.0; iPhone14,2)',
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException('App version must be at least 1.0.0'),
      );
    });

    it('should throw UnauthorizedException for version too old (minor)', () => {
      mockConfigService.get.mockImplementation((key, defaultValue) => {
        if (key === 'MIN_APP_VERSION') return '1.5.0';
        if (key === 'APP_NAME') return 'BreathAway';
        if (key === 'REQUIRED_PLATFORMS') return '["iOS","Android"]';
        return defaultValue;
      });

      const middleware = new UserAgentMiddleware(mockConfigService as any);

      mockRequest.headers = {
        'user-agent': 'BreathAway/1.4.9 (iOS 16.0; iPhone14,2)',
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException('App version must be at least 1.5.0'),
      );
    });

    it('should accept version equal to minimum', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/1.0.0 (iOS 16.0; iPhone14,2)',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept version greater than minimum (major)', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/2.0.0 (iOS 16.0; iPhone14,2)',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept version greater than minimum (minor)', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/1.1.0 (iOS 16.0; iPhone14,2)',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept version greater than minimum (patch)', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/1.0.1 (iOS 16.0; iPhone14,2)',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should store parsed user agent data in request', () => {
      mockRequest.headers = {
        'user-agent': 'BreathAway/3.2.1 (Android 14; Samsung Galaxy S23)',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['userAgentData']).toEqual({
        appName: 'BreathAway',
        version: '3.2.1',
        platform: 'Android',
        osVersion: '14',
        deviceModel: 'Samsung Galaxy S23',
      });
    });
  });
});
