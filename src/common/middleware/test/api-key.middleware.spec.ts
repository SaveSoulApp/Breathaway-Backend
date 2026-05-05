import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyMiddleware } from '../api-key.middleware';
import { Request, Response, NextFunction } from 'express';

describe('ApiKeyMiddleware', () => {
  let middleware: ApiKeyMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockConfigService: any;

  const validApiKeys = ['key1', 'key2', 'key3'];

  beforeEach(async () => {
    // Create fresh mock for each test
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'API_KEYS') {
          return JSON.stringify(validApiKeys);
        }
        return null;
      }),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyMiddleware,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    middleware = module.get<ApiKeyMiddleware>(ApiKeyMiddleware);

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
    it('should throw error when API_KEYS is missing', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => {
        new ApiKeyMiddleware(mockConfigService as any);
      }).toThrow('API_KEYS environment variable is required');
    });

    it('should throw error when API_KEYS is not valid JSON', () => {
      mockConfigService.get.mockReturnValue('not-valid-json');

      expect(() => {
        new ApiKeyMiddleware(mockConfigService as any);
      }).toThrow(/Failed to parse API_KEYS/);
    });

    it('should throw error when API_KEYS is not an array', () => {
      mockConfigService.get.mockReturnValue(JSON.stringify({ key: 'value' }));

      expect(() => {
        new ApiKeyMiddleware(mockConfigService as any);
      }).toThrow(/Failed to parse API_KEYS/);
    });

    it('should throw error when API_KEYS array is empty', () => {
      mockConfigService.get.mockReturnValue(JSON.stringify([]));

      expect(() => {
        new ApiKeyMiddleware(mockConfigService as any);
      }).toThrow('No valid API keys configured');
    });

    it('should filter out empty strings from API keys', () => {
      mockConfigService.get.mockReturnValue(
        JSON.stringify(['key1', '', '  ', 'key2']),
      );

      const middleware = new ApiKeyMiddleware(mockConfigService as any);
      expect(middleware).toBeDefined();
    });
  });

  describe('use', () => {
    it('should accept valid API key', () => {
      mockRequest.headers = {
        'x-api-key': 'key1',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['apiKey']).toBe('key1');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-API-Key header is missing', () => {
      mockRequest.headers = {};

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(new UnauthorizedException('X-API-Key header is required'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-API-Key is not a string', () => {
      mockRequest.headers = {
        'x-api-key': ['array-value'] as any,
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException('X-API-Key header must be a string'),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid API key', () => {
      mockRequest.headers = {
        'x-api-key': 'invalid-key',
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(new UnauthorizedException('Invalid X-API-Key'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should store API key in request object', () => {
      const apiKey = 'key2';
      mockRequest.headers = {
        'x-api-key': apiKey,
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['apiKey']).toBe(apiKey);
    });

    it('should accept any valid API key from the configured list', () => {
      for (const key of validApiKeys) {
        mockRequest.headers = { 'x-api-key': key };
        mockNext = jest.fn();

        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );

        expect(mockNext).toHaveBeenCalled();
      }
    });
  });
});
