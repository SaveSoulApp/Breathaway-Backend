import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DevicePlatform,
  LegalConsentContext,
  LegalDocumentType,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import {
  AcceptLegalConsentRequestDto,
  CreateLegalDocumentVersionRequestDto,
} from '../dto';
import {
  LEGAL_POLICY_UPDATED_EVENT,
  LegalPolicyUpdatedEvent,
} from '../events/legal-policy-updated.event';
import { LegalService, MANDATORY_SIGNUP_DOCUMENTS } from '../legal.service';

describe('LegalService', () => {
  let service: LegalService;
  let prisma: MockPrismaService;
  let eventEmitter: { emit: jest.Mock };
  let clsMock: { get: jest.Mock };

  const userId = '01JHUSER1234567890ABCDEFGH';

  const mockTermsDoc = {
    id: '01JHTERMS00000000000000001',
    type: LegalDocumentType.TERMS_OF_SERVICE,
    version: '1.0.0',
    title: 'Terms and Conditions',
    documentUrl: 'https://breathaway.app/terms',
    contentHash: 'hash-terms-1.0.0',
    snapshotStoragePath: null,
    requiresReacceptance: true,
    changeSummary: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    supersededAt: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockPrivacyDoc = {
    id: '01JTPRIVACY000000000000001',
    type: LegalDocumentType.PRIVACY_POLICY,
    version: '1.0.0',
    title: 'Privacy Policy',
    documentUrl: 'https://breathaway.app/privacy',
    contentHash: 'hash-privacy-1.0.0',
    snapshotStoragePath: null,
    requiresReacceptance: true,
    changeSummary: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    supersededAt: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockCancellationDoc = {
    id: '01JTCANCEL0000000000000001',
    type: LegalDocumentType.CANCELLATION_POLICY,
    version: '1.0.0',
    title: 'Cancellation and Refund Policy',
    documentUrl: 'https://breathaway.app/cancellation',
    contentHash: 'hash-cancellation-1.0.0',
    snapshotStoragePath: null,
    requiresReacceptance: true,
    changeSummary: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    supersededAt: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    eventEmitter = { emit: jest.fn() };
    clsMock = {
      get: jest.fn((key: string) => {
        if (key === 'ipAddress') return '203.0.113.1';
        if (key === 'userAgent') return 'BreathAway-Web/1.0';
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
        LegalService,
        { provide: PrismaService, useValue: prisma },
        { provide: LoggerService, useValue: loggerServiceMock },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ClsService, useValue: clsMock },
      ],
    }).compile();

    service = module.get<LegalService>(LegalService);
  });

  describe('getActiveDocuments', () => {
    it('should return the latest active version for each document type', async () => {
      prisma.legalDocumentVersion.findMany.mockResolvedValue([
        mockTermsDoc,
        mockPrivacyDoc,
        mockCancellationDoc,
      ]);

      const result = await service.getActiveDocuments();

      expect(result).toHaveLength(3);
      expect(prisma.legalDocumentVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            effectiveAt: expect.any(Object),
          },
          distinct: ['type'],
        }),
      );
    });
  });

  describe('getUserComplianceStatus', () => {
    it('should return compliant: true when user has accepted all current versions', async () => {
      prisma.legalDocumentVersion.findMany
        .mockResolvedValueOnce([
          mockTermsDoc,
          mockPrivacyDoc,
          mockCancellationDoc,
        ]) // active
        .mockResolvedValueOnce([]); // upcoming

      prisma.userLegalConsent.findMany.mockResolvedValue([
        {
          id: 'c1',
          userId,
          documentVersionId: mockTermsDoc.id,
          documentType: LegalDocumentType.TERMS_OF_SERVICE,
          version: '1.0.0',
          context: LegalConsentContext.SIGNUP,
          platform: DevicePlatform.WEB,
          ipAddress: '203.0.113.1',
          userAgent: 'TestUA',
          acceptedAt: new Date(),
        },
        {
          id: 'c2',
          userId,
          documentVersionId: mockPrivacyDoc.id,
          documentType: LegalDocumentType.PRIVACY_POLICY,
          version: '1.0.0',
          context: LegalConsentContext.SIGNUP,
          platform: DevicePlatform.WEB,
          ipAddress: '203.0.113.1',
          userAgent: 'TestUA',
          acceptedAt: new Date(),
        },
        {
          id: 'c3',
          userId,
          documentVersionId: mockCancellationDoc.id,
          documentType: LegalDocumentType.CANCELLATION_POLICY,
          version: '1.0.0',
          context: LegalConsentContext.SIGNUP,
          platform: DevicePlatform.WEB,
          ipAddress: '203.0.113.1',
          userAgent: 'TestUA',
          acceptedAt: new Date(),
        },
      ]);

      const status = await service.getUserComplianceStatus(userId);

      expect(status.isCompliant).toBe(true);
      expect(status.pendingDocuments).toHaveLength(0);
      expect(status.upcomingDocuments).toHaveLength(0);
    });

    it('should return compliant: false with pending documents when a version requiring re-acceptance is unaccepted', async () => {
      const updatedTerms = {
        ...mockTermsDoc,
        id: '01JHTERMS00000000000000002',
        version: '2.0.0',
        requiresReacceptance: true,
      };

      prisma.legalDocumentVersion.findMany
        .mockResolvedValueOnce([
          updatedTerms,
          mockPrivacyDoc,
          mockCancellationDoc,
        ]) // active
        .mockResolvedValueOnce([]); // upcoming

      // User has only accepted v1.0.0
      prisma.userLegalConsent.findMany.mockResolvedValue([
        {
          id: 'c1',
          userId,
          documentVersionId: mockTermsDoc.id,
          documentType: LegalDocumentType.TERMS_OF_SERVICE,
          version: '1.0.0',
          context: LegalConsentContext.SIGNUP,
          platform: DevicePlatform.WEB,
          ipAddress: '203.0.113.1',
          userAgent: 'TestUA',
          acceptedAt: new Date(),
        },
      ]);

      const status = await service.getUserComplianceStatus(userId);

      expect(status.isCompliant).toBe(false);
      expect(status.pendingDocuments).toHaveLength(3); // Terms v2.0.0, Privacy (missing), Cancellation (missing)
    });
  });

  describe('recordConsents', () => {
    it('should record user legal consent in a transaction and emit audit event', async () => {
      const dto: AcceptLegalConsentRequestDto = {
        consents: [
          {
            documentType: LegalDocumentType.TERMS_OF_SERVICE,
            version: '1.0.0',
          },
        ],
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          legalDocumentVersion: {
            findUnique: jest.fn().mockResolvedValue(mockTermsDoc),
          },
          userLegalConsent: {
            create: jest.fn().mockResolvedValue({
              id: 'c-new',
              userId,
              documentVersionId: mockTermsDoc.id,
              documentType: LegalDocumentType.TERMS_OF_SERVICE,
              version: '1.0.0',
              context: LegalConsentContext.IN_APP_REACCEPTANCE,
              platform: DevicePlatform.WEB,
              ipAddress: '203.0.113.1',
              userAgent: 'BreathAway-Web/1.0',
              acceptedAt: new Date(),
            }),
          },
        });
      });

      const result = await service.recordConsents(userId, dto);

      expect(result).toHaveLength(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          actionType: 'LEGAL_CONSENT_RECORDED',
          userId,
        }),
      );
    });

    it('should throw NotFoundException if document version does not exist', async () => {
      const dto: AcceptLegalConsentRequestDto = {
        consents: [
          {
            documentType: LegalDocumentType.TERMS_OF_SERVICE,
            version: '99.9.9',
          },
        ],
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          legalDocumentVersion: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        });
      });

      await expect(service.recordConsents(userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resolveAndRecordSignupConsents', () => {
    it('should throw BadRequestException if neither acceptedTermsAndPolicies nor acceptedLegalDocs is provided', async () => {
      const txMock = {} as any;

      await expect(
        service.resolveAndRecordSignupConsents(txMock, userId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if acceptedLegalDocs is missing any of the 3 mandatory types', async () => {
      const txMock = {} as any;

      await expect(
        service.resolveAndRecordSignupConsents(txMock, userId, {
          acceptedLegalDocs: [
            {
              documentType: LegalDocumentType.TERMS_OF_SERVICE,
              version: '1.0.0',
            },
            // Missing PRIVACY_POLICY and CANCELLATION_POLICY
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record all 3 mandatory documents when acceptedTermsAndPolicies is true', async () => {
      const txMock = {
        legalDocumentVersion: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(mockTermsDoc)
            .mockResolvedValueOnce(mockPrivacyDoc)
            .mockResolvedValueOnce(mockCancellationDoc),
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(mockTermsDoc)
            .mockResolvedValueOnce(mockPrivacyDoc)
            .mockResolvedValueOnce(mockCancellationDoc),
        },
        userLegalConsent: {
          create: jest.fn().mockResolvedValue({ id: 'c-new' }),
        },
      } as any;

      await service.resolveAndRecordSignupConsents(txMock, userId, {
        acceptedTermsAndPolicies: true,
      });

      expect(txMock.userLegalConsent.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('publishVersion', () => {
    it('should publish a new version and emit LegalPolicyUpdatedEvent when requiresReacceptance is true', async () => {
      const dto: CreateLegalDocumentVersionRequestDto = {
        type: LegalDocumentType.TERMS_OF_SERVICE,
        version: '2.0.0',
        title: 'Terms of Service v2',
        documentUrl: 'https://breathaway.app/terms',
        contentHash: 'hash-terms-2.0.0',
        requiresReacceptance: true,
        changeSummary: 'Updated dispute arbitration clause.',
      };

      prisma.legalDocumentVersion.findUnique.mockResolvedValue(null);

      const publishedDoc = {
        ...mockTermsDoc,
        id: 'new-doc-id',
        version: dto.version,
        title: dto.title,
        contentHash: dto.contentHash,
        requiresReacceptance: true,
        changeSummary: dto.changeSummary,
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          legalDocumentVersion: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            create: jest.fn().mockResolvedValue(publishedDoc),
          },
        });
      });

      const result = await service.publishVersion(dto);

      expect(result.version).toBe('2.0.0');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        LEGAL_POLICY_UPDATED_EVENT,
        expect.any(LegalPolicyUpdatedEvent),
      );
    });

    it('should throw ConflictException if version already exists', async () => {
      const dto: CreateLegalDocumentVersionRequestDto = {
        type: LegalDocumentType.TERMS_OF_SERVICE,
        version: '1.0.0',
        title: 'Terms',
        documentUrl: 'https://breathaway.app/terms',
        contentHash: 'hash',
      };

      prisma.legalDocumentVersion.findUnique.mockResolvedValue(
        mockTermsDoc as any,
      );

      await expect(service.publishVersion(dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getUserConsentHistory', () => {
    it('should return paginated user legal consent history', async () => {
      prisma.userLegalConsent.count.mockResolvedValue(1);
      prisma.userLegalConsent.findMany.mockResolvedValue([
        {
          id: 'c1',
          userId,
          documentVersionId: mockTermsDoc.id,
          documentType: LegalDocumentType.TERMS_OF_SERVICE,
          version: '1.0.0',
          context: LegalConsentContext.SIGNUP,
          platform: DevicePlatform.WEB,
          ipAddress: '203.0.113.1',
          userAgent: 'TestUA',
          acceptedAt: new Date(),
        },
      ]);

      const result = await service.getUserConsentHistory(userId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });
});
