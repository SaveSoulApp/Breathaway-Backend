import { Test, TestingModule } from '@nestjs/testing';
import { LegalDocumentType } from '@prisma/client';

import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '@modules/admin/guards/admin-oidc-auth.guard';

import {
  AcceptLegalConsentRequestDto,
  CreateLegalDocumentVersionRequestDto,
} from '../dto';
import { LegalController } from '../legal.controller';
import { LegalService } from '../legal.service';

describe('LegalController', () => {
  let controller: LegalController;
  let legalService: {
    getActiveDocuments: jest.Mock;
    getUserComplianceStatus: jest.Mock;
    recordConsents: jest.Mock;
    getUserConsentHistory: jest.Mock;
    publishVersion: jest.Mock;
  };

  const userId = '01JHUSER1234567890ABCDEFGH';

  beforeEach(async () => {
    legalService = {
      getActiveDocuments: jest.fn(),
      getUserComplianceStatus: jest.fn(),
      recordConsents: jest.fn(),
      getUserConsentHistory: jest.fn(),
      publishVersion: jest.fn(),
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
      controllers: [LegalController],
      providers: [
        { provide: LegalService, useValue: legalService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(AdminOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<LegalController>(LegalController);
  });

  describe('getActiveDocuments', () => {
    it('should delegate to legalService.getActiveDocuments', async () => {
      const mockDocs = [{ id: '1', version: '1.0.0' }];
      legalService.getActiveDocuments.mockResolvedValue(mockDocs);

      const result = await controller.getActiveDocuments();

      expect(result).toBe(mockDocs);
      expect(legalService.getActiveDocuments).toHaveBeenCalledTimes(1);
    });
  });

  describe('getComplianceStatus', () => {
    it('should delegate to legalService.getUserComplianceStatus with current user id', async () => {
      const mockStatus = {
        isCompliant: true,
        pendingDocuments: [],
        upcomingDocuments: [],
      };
      legalService.getUserComplianceStatus.mockResolvedValue(mockStatus);

      const result = await controller.getComplianceStatus(userId);

      expect(result).toBe(mockStatus);
      expect(legalService.getUserComplianceStatus).toHaveBeenCalledWith(userId);
    });
  });

  describe('recordConsents', () => {
    it('should delegate to legalService.recordConsents with metadata', async () => {
      const dto: AcceptLegalConsentRequestDto = {
        consents: [
          {
            documentType: LegalDocumentType.TERMS_OF_SERVICE,
            version: '1.0.0',
          },
        ],
      };
      const mockResult = [{ id: 'c1' }];
      legalService.recordConsents.mockResolvedValue(mockResult);

      const result = await controller.recordConsents(
        userId,
        dto,
        '203.0.113.1',
        'BreathAway-Web/1.0',
      );

      expect(result).toBe(mockResult);
      expect(legalService.recordConsents).toHaveBeenCalledWith(
        userId,
        dto,
        undefined,
        {
          ipAddress: '203.0.113.1',
          userAgent: 'BreathAway-Web/1.0',
        },
      );
    });
  });

  describe('getConsentHistory', () => {
    it('should delegate to legalService.getUserConsentHistory', async () => {
      const mockHistory = {
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      };
      legalService.getUserConsentHistory.mockResolvedValue(mockHistory);

      const result = await controller.getConsentHistory(userId, {
        page: 1,
        limit: 10,
      });

      expect(result).toBe(mockHistory);
      expect(legalService.getUserConsentHistory).toHaveBeenCalledWith(userId, {
        page: 1,
        limit: 10,
      });
    });
  });

  describe('publishVersion', () => {
    it('should delegate to legalService.publishVersion', async () => {
      const dto: CreateLegalDocumentVersionRequestDto = {
        type: LegalDocumentType.TERMS_OF_SERVICE,
        version: '1.0.0',
        title: 'Terms',
        documentUrl: 'https://breathaway.app/terms',
        contentHash: 'hash',
      };
      const mockCreated = { id: 'v1', ...dto };
      legalService.publishVersion.mockResolvedValue(mockCreated);

      const result = await controller.publishVersion(dto);

      expect(result).toBe(mockCreated);
      expect(legalService.publishVersion).toHaveBeenCalledWith(dto);
    });
  });
});
