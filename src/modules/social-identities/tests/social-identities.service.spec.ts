import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@core/logger';
import { SocialidentitiesService } from '../social-identities.service';
import { ClsService } from 'nestjs-cls';

describe('SocialidentitiesService', () => {
  let service: SocialidentitiesService;
  let configService: jest.Mocked<ConfigService>;
  let contextualLogger: any;
  let logger: any;

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        SocialidentitiesService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<SocialidentitiesService>(SocialidentitiesService);
    configService = module.get(ConfigService);

    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyInstagramIdentity', () => {
    it('should throw InternalServerErrorException if INSTAGRAM_ACCESS_TOKEN is not defined', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(
        service.verifyInstagramIdentity(null, 'test-id'),
      ).rejects.toThrow(InternalServerErrorException);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'INSTAGRAM_ACCESS_TOKEN is not defined in the environment configuration.',
      );
    });

    it('should throw BadRequestException if Instagram API returns an error', async () => {
      configService.get.mockReturnValue('valid-token');
      const mockResponse = {
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid token' },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        service.verifyInstagramIdentity(null, 'test-id'),
      ).rejects.toThrow(BadRequestException);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Instagram API returned error: 400'),
      );
    });

    it('should throw BadRequestException if Instagram API returns an error without a message', async () => {
      configService.get.mockReturnValue('valid-token');
      const mockResponse = {
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({}),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        service.verifyInstagramIdentity(null, 'test-id'),
      ).rejects.toThrow(
        new BadRequestException(
          'Instagram API Error: Failed to verify Instagram identity',
        ),
      );
    });

    it('should throw BadGatewayException if network request fails completely', async () => {
      configService.get.mockReturnValue('valid-token');
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        service.verifyInstagramIdentity(null, 'test-id'),
      ).rejects.toThrow(BadGatewayException);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Network or unexpected error while calling Instagram API: Network error',
      );
    });

    it('should map and return data successfully if Instagram API responds correctly', async () => {
      configService.get.mockReturnValue('valid-token');

      const apiResponseData = {
        id: '123',
        name: 'Test Name',
        username: 'test_username',
        profile_pic: 'http://example.com/pic.jpg',
        is_verified_user: true,
        follower_count: 500,
        is_user_follow_business: false,
        is_business_follow_user: false,
      };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(apiResponseData),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.verifyInstagramIdentity(null, '123');

      expect(result).toEqual({
        id: '123',
        name: 'Test Name',
        username: 'test_username',
        profilePic: 'http://example.com/pic.jpg',
        isVerifiedUser: true,
        followerCount: 500,
        isUserFollowBusiness: false,
        isBusinessFollowUser: false,
        platform: 'instagram',
      });

      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Fetching identity for instagramId: 123',
      );
    });
  });
});
