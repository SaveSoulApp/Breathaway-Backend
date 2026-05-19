import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { SocialidentityController } from '../social-identities.controller';
import { SocialidentityService } from '../social-identities.service';
import { VerifyInstagramRequestDto } from '../dto';

describe('SocialidentityController', () => {
  let controller: SocialidentityController;
  let service: jest.Mocked<SocialidentityService>;
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

    const mockService = {
      verifyInstagramIdentity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialidentityController],
      providers: [
        { provide: SocialidentityService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get<SocialidentityController>(SocialidentityController);
    service = module.get(SocialidentityService);
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

      expect(service.verifyInstagramIdentity).toHaveBeenCalledWith('123456789');
      expect(result).toEqual(mockResponse);
    });
  });
});
