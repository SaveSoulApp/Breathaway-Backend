import { Test, TestingModule } from '@nestjs/testing';
import { PreferencesController } from '../preferences.controller';
import { PreferencesService } from '../preferences.service';
import { PreferencesResponseDto, UpdatePreferencesRequestDto } from '../dto';
import { LoggerService } from '@core/logger';

describe('PreferencesController', () => {
  let controller: PreferencesController;
  let service: PreferencesService;

  const mockPreferencesResponse: PreferencesResponseDto = {
    pushEnabled: true,
    whatsappEnabled: true,
    smsEnabled: true,
    emailEnabled: true,
  };

  beforeEach(async () => {
    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    };

    const mockPreferencesService = {
      getPreferences: jest.fn().mockResolvedValue(mockPreferencesResponse),
      updatePreferences: jest.fn().mockResolvedValue(mockPreferencesResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [
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

  describe('updatePreferences', () => {
    it('should update and return preferences', async () => {
      const dto: UpdatePreferencesRequestDto = { pushEnabled: false };
      const result = await controller.updatePreferences('user-1', dto);
      expect(service.updatePreferences).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockPreferencesResponse);
    });
  });
});
