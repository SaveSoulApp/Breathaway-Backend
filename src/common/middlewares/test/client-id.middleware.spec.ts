import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientIdMiddleware } from '../client-id.middleware';
import { Request, Response, NextFunction } from 'express';

describe('ClientIdMiddleware', () => {
  let middleware: ClientIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockConfigService: any;

  const validClientIds = ['client1', 'client2', 'client3'];

  beforeEach(async () => {
    // Create fresh mock for each test
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'CLIENT_IDS') {
          return JSON.stringify(validClientIds);
        }
        return null;
      }),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientIdMiddleware,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    middleware = module.get<ClientIdMiddleware>(ClientIdMiddleware);

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
    it('should throw error when CLIENT_IDS is missing', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => {
        new ClientIdMiddleware(mockConfigService as any);
      }).toThrow('CLIENT_IDS environment variable is required');
    });

    it('should throw error when CLIENT_IDS is not valid JSON', () => {
      mockConfigService.get.mockReturnValue('not-valid-json');

      expect(() => {
        new ClientIdMiddleware(mockConfigService as any);
      }).toThrow(/Failed to parse CLIENT_IDS/);
    });

    it('should throw error when CLIENT_IDS is not an array', () => {
      mockConfigService.get.mockReturnValue(JSON.stringify({ id: 'value' }));

      expect(() => {
        new ClientIdMiddleware(mockConfigService as any);
      }).toThrow(/Failed to parse CLIENT_IDS/);
    });

    it('should throw error when CLIENT_IDS array is empty', () => {
      mockConfigService.get.mockReturnValue(JSON.stringify([]));

      expect(() => {
        new ClientIdMiddleware(mockConfigService as any);
      }).toThrow('No valid client IDs configured');
    });

    it('should filter out empty strings from client IDs', () => {
      mockConfigService.get.mockReturnValue(
        JSON.stringify(['client1', '', '  ', 'client2']),
      );

      const middleware = new ClientIdMiddleware(mockConfigService as any);
      expect(middleware).toBeDefined();
    });
  });

  describe('use', () => {
    it('should accept valid client ID', () => {
      mockRequest.headers = {
        'x-client-id': 'client1',
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['clientId']).toBe('client1');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-Client-ID header is missing', () => {
      mockRequest.headers = {};

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(new UnauthorizedException('X-Client-ID header is required'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when X-Client-ID is not a string', () => {
      mockRequest.headers = {
        'x-client-id': ['array-value'] as any,
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(
        new UnauthorizedException('X-Client-ID header must be a string'),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid client ID', () => {
      mockRequest.headers = {
        'x-client-id': 'invalid-client',
      };

      expect(() =>
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        ),
      ).toThrow(new UnauthorizedException('Invalid X-Client-ID'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should store client ID in request object', () => {
      const clientId = 'client2';
      mockRequest.headers = {
        'x-client-id': clientId,
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['clientId']).toBe(clientId);
    });

    it('should accept any valid client ID from the configured list', () => {
      for (const id of validClientIds) {
        mockRequest.headers = { 'x-client-id': id };
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
