import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { MatchesController } from '../matches.controller';
import { MatchesService } from '../matches.service';
import { IntentType, MatchStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

describe('MatchesController', () => {
  let controller: MatchesController;
  let service: jest.Mocked<MatchesService>;

  const userId = 'user-id-123';
  const matchId = 'match-id-123';

  const mockMatchResponse = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: DateUtil.now(),
    myIntent: IntentType.CASUAL,
    theirIntent: IntentType.CASUAL,
    me: {
      id: userId,
      firstName: 'John',
      lastName: 'Doe',
      gender: null,
    },
    otherUser: {
      id: 'other-user-id',
      firstName: 'Jane',
      lastName: 'Doe',
      gender: null,
      label: null,
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
      controllers: [MatchesController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MatchesService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<MatchesController>(MatchesController);
    service = module.get(MatchesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return a list of active matches for the user', async () => {
      // Arrange
      const query = { page: 1, limit: 20 };
      const paginatedResponse = {
        data: [mockMatchResponse],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      } as any;
      service.findAllForUser.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(userId, query);

      // Assert
      expect(service.findAllForUser).toHaveBeenCalledWith(userId, query);
      expect(result).toEqual(paginatedResponse);
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
