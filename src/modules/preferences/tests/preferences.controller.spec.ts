import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsentChannel, ConsentSource } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import {
  ConsentLedgerResponseDto,
  PreferencesResponseDto,
  UpdatePreferencesRequestDto,
} from '../dto';
import { PreferencesController } from '../preferences.controller';
import { PreferencesService } from '../preferences.service';

describe('PreferencesController', () => {
  let controller: PreferencesController;
  let service: PreferencesService;

  const mockPreferencesResponse: PreferencesResponseDto = {
    pushEnabled: true,
    whatsappEnabled: true,
    smsEnabled: true,
    emailEnabled: true,
  };

  const mockConsentHistory: ConsentLedgerResponseDto[] = [
    {
      id: 'consent-1',
      channel: ConsentChannel.PUSH,
      consentGranted: true,
      source: ConsentSource.SIGNUP,
      createdAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const mockPreferencesService = {
      getPreferences: jest.fn().mockResolvedValue(mockPreferencesResponse),
      updatePreferences: jest.fn().mockResolvedValue(mockPreferencesResponse),
      getConsentHistory: jest.fn().mockResolvedValue(mockConsentHistory),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PreferencesService, useValue: mockPreferencesService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<PreferencesController>(PreferencesController);
    service = module.get<PreferencesService>(PreferencesService);
  });

  describe('getPreferences', () => {
    it('should return preferences', async () => {
      const result = await controller.getPreferences('user-1');
      expect(service.getPreferences).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockPreferencesResponse);
    });
  });

  describe('getConsentHistory', () => {
    it('should return consent ledger history for user', async () => {
      const result = await controller.getConsentHistory('user-1');
      expect(service.getConsentHistory).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockConsentHistory);
    });
  });

  describe('updatePreferences', () => {
    it('should update and return preferences', async () => {
      const dto: UpdatePreferencesRequestDto = { pushEnabled: false };
      const result = await controller.updatePreferences('user-1', dto);
      expect(service.updatePreferences).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockPreferencesResponse);
    });
  });
});
