import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { JwtAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';

import { SessionsController } from '../sessions.controller';
import { SessionsService } from '../sessions.service';

describe('SessionsController', () => {
  let controller: SessionsController;
  let sessionsService: jest.Mocked<SessionsService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    info: jest.Mock;
    verbose: jest.Mock;
  };

  const mockUserId = '01M5USER00000000000000001';

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      verbose: jest.fn(),
    };

    const logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    } as unknown as jest.Mocked<LoggerService>;

    const mockService = {
      getUserSessions: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllOtherSessions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: SessionsService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<SessionsController>(SessionsController);
    sessionsService = module.get(SessionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserSessions', () => {
    it('should delegate to sessionsService.getUserSessions with params', async () => {
      // Arrange
      const expectedResponse = {
        sessions: [],
        registeredDevices: [],
        totalActiveSessions: 0,
      };
      sessionsService.getUserSessions.mockResolvedValue(
        expectedResponse as any,
      );

      // Act
      const result = await controller.getUserSessions(
        mockUserId,
        'family-1',
        'device-1',
      );

      // Assert
      expect(sessionsService.getUserSessions).toHaveBeenCalledWith(
        mockUserId,
        'family-1',
        'device-1',
      );
      expect(result).toBe(expectedResponse);
    });
  });

  describe('revokeSession', () => {
    it('should delegate to sessionsService.revokeSession', async () => {
      // Arrange
      sessionsService.revokeSession.mockResolvedValue(undefined);

      // Act
      await controller.revokeSession(mockUserId, 'session-123');

      // Assert
      expect(sessionsService.revokeSession).toHaveBeenCalledWith(
        mockUserId,
        'session-123',
      );
    });
  });

  describe('revokeAllOtherSessions', () => {
    it('should delegate to sessionsService.revokeAllOtherSessions with params', async () => {
      // Arrange
      const expectedResponse = { revokedCount: 2 };
      sessionsService.revokeAllOtherSessions.mockResolvedValue(
        expectedResponse,
      );

      // Act
      const result = await controller.revokeAllOtherSessions(
        mockUserId,
        'family-1',
        'device-1',
      );

      // Assert
      expect(sessionsService.revokeAllOtherSessions).toHaveBeenCalledWith(
        mockUserId,
        'family-1',
        'device-1',
      );
      expect(result).toBe(expectedResponse);
    });
  });
});
