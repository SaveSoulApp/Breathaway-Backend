import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { SocialIdentitiesController } from '../social-identities.controller';
import { SocialidentitiesService } from '../social-identities.service';
import { VerifyInstagramRequestDto } from '../dto';
import { ClsService } from 'nestjs-cls';

describe('SocialIdentitiesController', () => {
  let controller: SocialIdentitiesController;
  let service: jest.Mocked<SocialidentitiesService>;

  beforeEach(async () => {
    const contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockService = {
      verifyInstagramIdentity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialIdentitiesController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: SocialidentitiesService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get<SocialIdentitiesController>(
      SocialIdentitiesController,
    );
    service = module.get(SocialidentitiesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyInstagram', () => {
    it('should successfully verify instagram identity', async () => {
      const dto: VerifyInstagramRequestDto = {
        instagramId: '123456789',
      };

      const mockResponse = {
        id: '123456789',
        name: 'Test User',
        username: 'testuser',
        profilePic: 'https://example.com/pic.jpg',
        isVerifiedUser: true,
        followerCount: 1000,
        isUserFollowBusiness: false,
        isBusinessFollowUser: false,
        platform: 'instagram' as const,
      };

      service.verifyInstagramIdentity.mockResolvedValue(mockResponse);

      const result = await controller.verifyInstagram(dto);

      expect(service.verifyInstagramIdentity).toHaveBeenCalledWith(
        null,
        '123456789',
      );
      expect(result).toEqual(mockResponse);
    });
  });
});
