import { Test, TestingModule } from '@nestjs/testing';
import { DsarExportStatus } from '@prisma/client';

import { LoggerService } from '@core/logger';

import { DsarExportResponseDto, RequestDsarExportRequestDto } from '../dto';
import { DsarExportService } from '../services/dsar-export.service';
import { UsersController } from '../users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<DsarExportService>;

  const userId = '01JB0Z9G4K3V8W2N7Q1M9P6R5U';
  const exportId = '01JB0Z9G4K3V8W2N7Q1M9P6R5T';

  const mockResponseDto: DsarExportResponseDto = {
    id: exportId,
    userId,
    status: DsarExportStatus.PENDING,
    passphrase: 'TestPassphrase123!',
    downloadUrl: null,
    fileSizeBytes: null,
    checksumSha256: null,
    requestedAt: new Date('2026-10-18T12:00:00Z'),
    completedAt: null,
    expiresAt: null,
  };

  beforeEach(async () => {
    const mockService = {
      requestExport: jest.fn(),
      getLatestExport: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: DsarExportService, useValue: mockService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(DsarExportService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestExport', () => {
    it('should invoke dsarExportService.requestExport and return DsarExportResponseDto', async () => {
      const dto: RequestDsarExportRequestDto = {
        passphrase: 'TestPassphrase123!',
      };
      service.requestExport.mockResolvedValue(mockResponseDto);

      const result = await controller.requestExport(userId, dto);

      expect(service.requestExport).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(mockResponseDto);
    });
  });

  describe('getLatestExport', () => {
    it('should invoke dsarExportService.getLatestExport and return DsarExportResponseDto', async () => {
      const completedResponse: DsarExportResponseDto = {
        ...mockResponseDto,
        status: DsarExportStatus.COMPLETED,
        downloadUrl: 'https://storage.googleapis.com/test-signed-url',
        fileSizeBytes: 1024,
        checksumSha256: 'mock-checksum',
        completedAt: new Date('2026-10-18T12:00:05Z'),
        expiresAt: new Date('2026-10-25T12:00:05Z'),
      };
      service.getLatestExport.mockResolvedValue(completedResponse);

      const result = await controller.getLatestExport(userId);

      expect(service.getLatestExport).toHaveBeenCalledWith(userId);
      expect(result).toEqual(completedResponse);
    });
  });
});
