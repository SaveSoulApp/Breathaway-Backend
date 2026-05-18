import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { BasicAuthGuard } from '@common/guards/basic-auth.guard';
import { InstagramController } from '../instagram.controller';
import { InstagramService } from '../instagram.service';

describe('InstagramController', () => {
  let controller: InstagramController;
  let service: jest.Mocked<InstagramService>;
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
      refreshAccessToken: jest.fn(),
      refreshSystemAccessToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstagramController],
      providers: [
        { provide: InstagramService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    })
      .overrideGuard(BasicAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<InstagramController>(InstagramController);
    service = module.get(InstagramService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refresh', () => {
    it('should refresh access token', async () => {
      const token = 'test-token';
      const mockResult = { access_token: 'new-token' };
      service.refreshAccessToken.mockResolvedValue(mockResult);

      const result = await controller.refresh(token);

      expect(service.refreshAccessToken).toHaveBeenCalledWith(token);
      expect(result).toEqual(mockResult);
    });
  });

  describe('refreshEnvToken', () => {
    it('should refresh system access token', async () => {
      const mockResult = { access_token: 'new-system-token' };
      service.refreshSystemAccessToken.mockResolvedValue(mockResult);

      const result = await controller.refreshEnvToken();

      expect(service.refreshSystemAccessToken).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });
});
