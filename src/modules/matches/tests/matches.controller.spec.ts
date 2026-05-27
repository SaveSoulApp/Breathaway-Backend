import { Test, TestingModule } from '@nestjs/testing';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { MatchController } from '../matches.controller';
import { MatchService } from '../matches.service';
import { IntentType, MatchStatus } from '@prisma/client';

describe('MatchController', () => {
  let controller: MatchController;
  let service: jest.Mocked<MatchService>;

  const userId = 'user-id-123';
  const matchId = 'match-id-123';

  const mockMatchResponse = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: DateUtil.now(),
    intentOne: IntentType.CASUAL,
    intentTwo: IntentType.CASUAL,
    otherUser: {
      id: 'other-user-id',
      firstName: 'Jane',
      lastName: 'Doe',
    },
  };

  beforeEach(async () => {
    const mockService = {
      findAllForUser: jest.fn(),
      findOneForUser: jest.fn(),
      unmatch: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchController],
      providers: [
        { provide: MatchService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<MatchController>(MatchController);
    service = module.get(MatchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return a list of active matches for the user', async () => {
      // Arrange
      service.findAllForUser.mockResolvedValue([mockMatchResponse]);

      // Act
      const result = await controller.findAll(userId);

      // Assert
      expect(service.findAllForUser).toHaveBeenCalledWith(userId);
      expect(result).toEqual([mockMatchResponse]);
    });
  });

  describe('findOne', () => {
    it('should return a specific match by ID', async () => {
      // Arrange
      service.findOneForUser.mockResolvedValue(mockMatchResponse);

      // Act
      const result = await controller.findOne(userId, matchId);

      // Assert
      expect(service.findOneForUser).toHaveBeenCalledWith(matchId, userId);
      expect(result).toEqual(mockMatchResponse);
    });
  });

  describe('remove', () => {
    it('should unmatch from a user (soft delete)', async () => {
      // Arrange
      service.unmatch.mockResolvedValue({ success: true });

      // Act
      const result = await controller.remove(userId, matchId);

      // Assert
      expect(service.unmatch).toHaveBeenCalledWith(matchId, userId);
      expect(result).toEqual({ success: true });
    });
  });
});
