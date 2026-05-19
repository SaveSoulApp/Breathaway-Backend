import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { InstagramScheduler } from '../instagram.scheduler';
import { InstagramService } from '../instagram.service';

describe('InstagramScheduler', () => {
  let scheduler: InstagramScheduler;
  let service: any;
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
      log: jest.fn(),
      error: jest.fn(),
    };

    const mockService = {
      refreshSystemAccessToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstagramScheduler,
        { provide: InstagramService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    scheduler = module.get<InstagramScheduler>(InstagramScheduler);
    service = module.get(InstagramService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleTokenRefresh', () => {
    it('should immediately return and do nothing as it is currently disabled', async () => {
      const result = await scheduler.handleTokenRefresh();

      expect(result).toBeUndefined();
      expect(logger.log).not.toHaveBeenCalled();
      expect(service.refreshSystemAccessToken).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
