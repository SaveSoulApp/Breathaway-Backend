import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsentChannel, ConsentSource } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import {
  ConsentLedgerResponseDto,
  PreferencesResponseDto,
  UpdatePreferencesRequestDto,
} from '../dto';
import { PreferencesService } from '../preferences.service';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let prisma: MockPrismaService;
  let clsMock: { get: jest.Mock };

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
    clsMock = {
      get: jest.fn((key: string) => {
        if (key === 'ipAddress') return '192.168.1.1';
        if (key === 'userAgent') return 'BreathAway-iOS/1.0';
        return undefined;
      }),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        event: jest.fn(),
        info: jest.fn(),
      }),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: clsMock },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        PreferencesService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
    prisma = module.get(PrismaService);
    prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
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
    it('should upsert preferences and append changed channels to ConsentLedger', async () => {
      const dto: UpdatePreferencesRequestDto = {
        pushEnabled: false,
        whatsappEnabled: false,
      };
      const updatedPreference = {
        ...mockPreference,
        pushEnabled: false,
        whatsappEnabled: false,
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(
        mockPreference,
      );
      prisma.notificationPreference.upsert.mockResolvedValue(updatedPreference);
      prisma.consentLedger.createMany.mockResolvedValue({ count: 2 });

      const result = await service.updatePreferences(userId, dto);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: { pushEnabled: false, whatsappEnabled: false },
        create: {
          userId,
          pushEnabled: false,
          whatsappEnabled: false,
          smsEnabled: true,
          emailEnabled: true,
        },
      });

      expect(prisma.consentLedger.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId,
            channel: ConsentChannel.PUSH,
            consentGranted: false,
            source: ConsentSource.USER_TOGGLE,
            ipAddress: '192.168.1.1',
            userAgent: 'BreathAway-iOS/1.0',
          },
          {
            userId,
            channel: ConsentChannel.WHATSAPP,
            consentGranted: false,
            source: ConsentSource.USER_TOGGLE,
            ipAddress: '192.168.1.1',
            userAgent: 'BreathAway-iOS/1.0',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.pushEnabled).toBe(false);
      expect(result.whatsappEnabled).toBe(false);
    });

    it('should not write to ConsentLedger if incoming values match existing state', async () => {
      const dto: UpdatePreferencesRequestDto = { pushEnabled: true };
      const updatedPreference = { ...mockPreference, pushEnabled: true };

      prisma.notificationPreference.findUnique.mockResolvedValue(
        mockPreference,
      );
      prisma.notificationPreference.upsert.mockResolvedValue(updatedPreference);

      const result = await service.updatePreferences(userId, dto);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalled();
      expect(prisma.consentLedger.createMany).not.toHaveBeenCalled();
      expect(result.pushEnabled).toBe(true);
    });
  });

  describe('getConsentHistory', () => {
    it('should return consent ledger entries ordered by createdAt desc', async () => {
      const mockHistory: ConsentLedgerResponseDto[] = [
        {
          id: 'ledger-2',
          channel: ConsentChannel.WHATSAPP,
          consentGranted: false,
          source: ConsentSource.USER_TOGGLE,
          createdAt: new Date('2026-10-14T10:00:00Z'),
        },
        {
          id: 'ledger-1',
          channel: ConsentChannel.WHATSAPP,
          consentGranted: true,
          source: ConsentSource.SIGNUP,
          createdAt: new Date('2026-10-14T09:00:00Z'),
        },
      ];

      prisma.consentLedger.findMany.mockResolvedValue(mockHistory as any);

      const result = await service.getConsentHistory(userId);

      expect(prisma.consentLedger.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          channel: true,
          consentGranted: true,
          source: true,
          createdAt: true,
        },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ledger-2');
    });
  });
});
