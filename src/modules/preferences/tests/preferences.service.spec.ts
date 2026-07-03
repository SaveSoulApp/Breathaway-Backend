import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { PreferencesService } from '../preferences.service';
import { PreferencesResponseDto, UpdatePreferencesRequestDto } from '../dto';
import { ClsService } from 'nestjs-cls';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let prisma: MockPrismaService;

  const userId = 'user-id-123';

  const mockPreference = {
    id: 'pref-id',
    userId,
    pushEnabled: true,
    whatsappEnabled: true,
    smsEnabled: true,
    emailEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() }),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        PreferencesService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreferences', () => {
    it('should return preferences if found', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(
        mockPreference,
      );

      const result = await service.getPreferences(userId);

      expect(prisma.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(result).toBeDefined();
      expect(result.pushEnabled).toBe(true);
    });

    it('should return default preferences if not found', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await service.getPreferences(userId);

      expect(prisma.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(result).toBeDefined();
      expect(result.pushEnabled).toBe(true);
    });
  });

  describe('getPreferencesMany', () => {
    it('should return preferences for multiple users including defaults for missing ones', async () => {
      const userIds = ['user-1', 'user-2'];
      const mockPrefList = [
        { ...mockPreference, userId: 'user-1', pushEnabled: false },
      ];

      prisma.notificationPreference.findMany.mockResolvedValue(mockPrefList);

      const result = await service.getPreferencesMany(userIds);

      expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({
        where: { userId: { in: userIds } },
      });
      expect(result.size).toBe(2);
      expect(result.get('user-1')?.pushEnabled).toBe(false); // Found in DB
      expect(result.get('user-2')?.pushEnabled).toBe(true); // Default fallback
    });

    it('should return empty map for empty input array', async () => {
      const result = await service.getPreferencesMany([]);
      expect(result.size).toBe(0);
      expect(prisma.notificationPreference.findMany).not.toHaveBeenCalled();
    });
  });

  describe('updatePreferences', () => {
    it('should upsert and return updated preferences', async () => {
      const dto: UpdatePreferencesRequestDto = { pushEnabled: false };
      const updatedPreference = { ...mockPreference, pushEnabled: false };

      prisma.notificationPreference.upsert.mockResolvedValue(updatedPreference);

      const result = await service.updatePreferences(userId, dto);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: { pushEnabled: false },
        create: {
          userId,
          pushEnabled: false,
          whatsappEnabled: true,
          smsEnabled: true,
          emailEnabled: true,
        },
      });
      expect(result).toBeDefined();
      expect(result.pushEnabled).toBe(false);
    });
  });
});
