import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DevicePlatform,
  LegalConsentContext,
  LegalDocumentType,
  LegalDocumentVersion,
  Prisma,
} from '@prisma/client';

import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import { MANDATORY_SIGNUP_DOCUMENTS } from './constants';
import {
  AcceptLegalConsentRequestDto,
  CreateLegalDocumentVersionRequestDto,
  LegalComplianceStatusResponseDto,
  LegalConsentQueryRequestDto,
  LegalDocumentVersionResponseDto,
  PaginatedUserLegalConsentResponseDto,
  UserLegalConsentResponseDto,
} from './dto';
import {
  LEGAL_POLICY_UPDATED_EVENT,
  LegalPolicyUpdatedEvent,
} from './events/legal-policy-updated.event';

/** Mandatory legal document types required for every customer account registration. */
export { MANDATORY_SIGNUP_DOCUMENTS } from './constants';

/**
 * Service orchestrating legal document versioning, user consent capture, compliance checking,
 * and immutable audit record management.
 */
@Injectable()
export class LegalService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    super(loggerService);
  }

  /**
   * Retrieves all currently active and legally enforced legal document versions.
   *
   * Queries for the latest active version of each document type where effectiveAt <= now().
   *
   * @returns Array of active legal document versions.
   */
  async getActiveDocuments(): Promise<LegalDocumentVersionResponseDto[]> {
    const now = new Date();
    this.logger.debug('Fetching active legal documents', {
      step: 'get_active_documents',
      now: now.toISOString(),
    });

    const activeVersions = await this.prisma.legalDocumentVersion.findMany({
      where: {
        isActive: true,
        effectiveAt: { lte: now },
      },
      orderBy: [{ type: 'asc' }, { effectiveAt: 'desc' }],
      distinct: ['type'],
    });

    return activeVersions as LegalDocumentVersionResponseDto[];
  }

  /**
   * Evaluates the authenticated user's current compliance status across all legal documents.
   *
   * Determines whether the user has accepted all currently enforced versions requiring re-acceptance,
   * and surfaces any upcoming document revisions published with advance notice.
   *
   * @param userId - Unique identifier of the user to evaluate.
   * @returns Comprehensive compliance status detailing pending and upcoming revisions.
   */
  async getUserComplianceStatus(
    userId: string,
  ): Promise<LegalComplianceStatusResponseDto> {
    const now = new Date();
    const ctx = { userId, step: 'check_compliance_status' };
    this.logger.debug('Evaluating legal compliance status', ctx);

    // 1. Fetch currently active versions for all document types
    const activeVersions = await this.prisma.legalDocumentVersion.findMany({
      where: {
        isActive: true,
        effectiveAt: { lte: now },
      },
      orderBy: [{ type: 'asc' }, { effectiveAt: 'desc' }],
      distinct: ['type'],
    });

    // 2. Fetch the user's latest consent for each document type
    const userConsents = await this.prisma.userLegalConsent.findMany({
      where: { userId },
      orderBy: [{ documentType: 'asc' }, { acceptedAt: 'desc' }],
      distinct: ['documentType'],
    });

    const consentMap = new Map<LegalDocumentType, string>();
    for (const consent of userConsents) {
      consentMap.set(consent.documentType, consent.version);
    }

    // 3. Determine pending documents requiring acceptance
    const pendingDocuments: LegalDocumentVersionResponseDto[] = [];
    for (const doc of activeVersions) {
      const acceptedVersion = consentMap.get(doc.type);
      if (
        !acceptedVersion ||
        (doc.requiresReacceptance && acceptedVersion !== doc.version)
      ) {
        pendingDocuments.push(doc as LegalDocumentVersionResponseDto);
      }
    }

    // 4. Determine upcoming revisions (effectiveAt > now) published for advance notice
    const upcomingVersions = await this.prisma.legalDocumentVersion.findMany({
      where: {
        isActive: true,
        effectiveAt: { gt: now },
        requiresReacceptance: true,
      },
      orderBy: { effectiveAt: 'asc' },
    });

    const isCompliant = pendingDocuments.length === 0;
    this.logger.debug('Compliance status evaluated', {
      ...ctx,
      isCompliant,
      pendingCount: pendingDocuments.length,
      upcomingCount: upcomingVersions.length,
    });

    return {
      isCompliant,
      pendingDocuments,
      upcomingDocuments: upcomingVersions as LegalDocumentVersionResponseDto[],
    };
  }

  /**
   * Records explicit user acceptance of one or more legal document revisions.
   *
   * Appends immutable records to UserLegalConsent and emits an audit event.
   *
   * @param userId - Unique identifier of the authenticated user.
   * @param dto - Array of document types and versions accepted.
   * @param context - Interaction context (e.g. IN_APP_REACCEPTANCE or SIGNIN_REACCEPTANCE).
   * @param clientMetadata - Client IP, User Agent, and platform.
   * @returns Array of newly persisted UserLegalConsent records.
   */
  async recordConsents(
    userId: string,
    dto: AcceptLegalConsentRequestDto,
    context: LegalConsentContext = LegalConsentContext.IN_APP_REACCEPTANCE,
    clientMetadata?: {
      ipAddress?: string;
      userAgent?: string;
      platform?: DevicePlatform;
    },
  ): Promise<UserLegalConsentResponseDto[]> {
    const ctx = {
      userId,
      context,
      consentsCount: dto.consents.length,
      step: 'record_consents',
    };
    this.logger.log('Recording user legal consents', ctx);

    const ipAddress =
      clientMetadata?.ipAddress ??
      this.cls.get<string | undefined>('ipAddress');
    const userAgent =
      clientMetadata?.userAgent ??
      this.cls.get<string | undefined>('userAgent');
    const platform = clientMetadata?.platform ?? DevicePlatform.WEB;

    // Deduplicate consents by documentType, retaining the last specified version
    const uniqueConsentsMap = new Map<LegalDocumentType, string>();
    for (const item of dto.consents) {
      uniqueConsentsMap.set(item.documentType, item.version);
    }
    const deduplicatedConsents = Array.from(uniqueConsentsMap.entries()).map(
      ([documentType, version]) => ({ documentType, version }),
    );

    const createdRecords: UserLegalConsentResponseDto[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const item of deduplicatedConsents) {
        const docVersion = await tx.legalDocumentVersion.findUnique({
          where: {
            type_version: {
              type: item.documentType,
              version: item.version,
            },
          },
        });

        if (!docVersion) {
          throw new NotFoundException(
            `Legal document version not found for type ${item.documentType} and version ${item.version}`,
          );
        }

        const consent = await tx.userLegalConsent.create({
          data: {
            userId,
            documentVersionId: docVersion.id,
            documentType: item.documentType,
            version: item.version,
            context,
            platform,
            ipAddress,
            userAgent,
          },
        });

        createdRecords.push(consent as unknown as UserLegalConsentResponseDto);
      }
    });

    this.emitAuditLog({
      actionType: AuditActionType.LEGAL_CONSENT_RECORDED,
      userId,
      ipAddress,
      metadata: {
        context,
        consents: deduplicatedConsents.map((c) => ({
          type: c.documentType,
          version: c.version,
        })),
      },
    });

    this.logger.event(LOG_EVENT.LEGAL_CONSENT_RECORDED, {
      ...ctx,
      count: createdRecords.length,
    });

    return createdRecords;
  }

  /**
   * Resolves and records mandatory legal document consents during user registration within a transaction.
   *
   * Supports either:
   * 1. Explicit document array (`acceptedLegalDocs`) containing specific versions for all 3 mandatory documents.
   * 2. Affirmative boolean (`acceptedTermsAndPolicies: true`) which automatically binds to the currently active
   *    versions of Terms of Service, Privacy Policy, and Cancellation Policy.
   *
   * @param tx - Active Prisma transaction client.
   * @param userId - Unique identifier of the newly provisioned user.
   * @param options - Consent payload options from signup request.
   * @param clientMetadata - Client IP, User Agent, and platform.
   */
  async resolveAndRecordSignupConsents(
    tx: Prisma.TransactionClient,
    userId: string,
    options: {
      acceptedTermsAndPolicies?: boolean;
      acceptedLegalDocs?: Array<{
        documentType: LegalDocumentType;
        version: string;
      }>;
    },
    clientMetadata?: {
      ipAddress?: string;
      userAgent?: string;
      platform?: DevicePlatform;
    },
  ): Promise<void> {
    const ctx = { userId, step: 'resolve_signup_consents' };
    this.logger.debug('Resolving and recording signup legal consents', ctx);

    const hasExplicitDocs =
      Array.isArray(options.acceptedLegalDocs) &&
      options.acceptedLegalDocs.length > 0;

    if (!options.acceptedTermsAndPolicies && !hasExplicitDocs) {
      throw new BadRequestException(
        'Registration requires explicit acceptance of all mandatory legal documents: Terms of Service, Privacy Policy, and Cancellation Policy',
      );
    }

    const resolvedDocVersions: LegalDocumentVersion[] = [];

    if (hasExplicitDocs && options.acceptedLegalDocs) {
      const explicitMap = new Map<LegalDocumentType, string>();
      for (const doc of options.acceptedLegalDocs) {
        explicitMap.set(doc.documentType, doc.version);
      }
      const missingTypes = MANDATORY_SIGNUP_DOCUMENTS.filter(
        (requiredType) => !explicitMap.has(requiredType),
      );

      if (missingTypes.length > 0) {
        throw new BadRequestException(
          `Registration is missing mandatory legal agreements: ${missingTypes.join(', ')}`,
        );
      }

      for (const [docType, version] of explicitMap.entries()) {
        const docVersion = await tx.legalDocumentVersion.findUnique({
          where: {
            type_version: {
              type: docType,
              version,
            },
          },
        });

        if (!docVersion) {
          throw new NotFoundException(
            `Legal document version not found for type ${docType} and version ${version}`,
          );
        }

        resolvedDocVersions.push(docVersion);
      }
    } else {
      // Auto-resolve currently active versions for all mandatory documents
      const now = new Date();
      for (const requiredType of MANDATORY_SIGNUP_DOCUMENTS) {
        const activeDoc = await tx.legalDocumentVersion.findFirst({
          where: {
            type: requiredType,
            isActive: true,
            effectiveAt: { lte: now },
          },
          orderBy: [{ type: 'asc' }, { effectiveAt: 'desc' }],
        });

        if (!activeDoc) {
          throw new NotFoundException(
            `No active legal document found for ${requiredType}. Please ensure active legal documents are seeded in the database.`,
          );
        }

        resolvedDocVersions.push(activeDoc);
      }
    }

    const ipAddress =
      clientMetadata?.ipAddress ??
      this.cls.get<string | undefined>('ipAddress');
    const userAgent =
      clientMetadata?.userAgent ??
      this.cls.get<string | undefined>('userAgent');
    const platform = clientMetadata?.platform ?? DevicePlatform.WEB;

    for (const docVersion of resolvedDocVersions) {
      await tx.userLegalConsent.create({
        data: {
          userId,
          documentVersionId: docVersion.id,
          documentType: docVersion.type,
          version: docVersion.version,
          context: LegalConsentContext.SIGNUP,
          platform,
          ipAddress,
          userAgent,
        },
      });
    }

    this.logger.debug('Mandatory signup legal consents successfully recorded', {
      ...ctx,
      count: resolvedDocVersions.length,
    });
  }

  /**
   * Publishes a new version of a legal document.
   *
   * Marks superseded versions and emits a domain event to trigger advance customer notifications
   * when material updates require re-acceptance.
   *
   * @param dto - Document version publication payload.
   * @returns Newly published LegalDocumentVersion record.
   */
  async publishVersion(
    dto: CreateLegalDocumentVersionRequestDto,
  ): Promise<LegalDocumentVersionResponseDto> {
    const ctx = {
      type: dto.type,
      version: dto.version,
      step: 'publish_version',
    };
    this.logger.log('Publishing legal document version', ctx);

    const existing = await this.prisma.legalDocumentVersion.findUnique({
      where: {
        type_version: {
          type: dto.type,
          version: dto.version,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Legal document version ${dto.version} already exists for ${dto.type}`,
      );
    }

    const effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : new Date();
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      // If taking effect immediately, supersede older active versions
      if (effectiveAt <= now) {
        await tx.legalDocumentVersion.updateMany({
          where: {
            type: dto.type,
            isActive: true,
            effectiveAt: { lte: now },
          },
          data: {
            isActive: false,
            supersededAt: now,
          },
        });
      }

      return tx.legalDocumentVersion.create({
        data: {
          type: dto.type,
          version: dto.version,
          title: dto.title,
          documentUrl: dto.documentUrl,
          contentHash: dto.contentHash,
          snapshotStoragePath: dto.snapshotStoragePath,
          requiresReacceptance: dto.requiresReacceptance ?? false,
          changeSummary: dto.changeSummary,
          effectiveAt,
          isActive: true,
        },
      });
    });

    this.emitAuditLog({
      actionType: AuditActionType.LEGAL_DOCUMENT_PUBLISHED,
      userId: this.cls.get<string | undefined>('adminEmail') ?? 'SYSTEM',
      resourceId: created.id,
      metadata: {
        documentType: created.type,
        version: created.version,
        requiresReacceptance: created.requiresReacceptance,
        effectiveAt: created.effectiveAt.toISOString(),
      },
    });

    this.logger.event(LOG_EVENT.LEGAL_DOCUMENT_PUBLISHED, {
      documentType: created.type,
      version: created.version,
      id: created.id,
    });

    // If revision requires re-acceptance or is material, dispatch domain event for user notifications
    if (created.requiresReacceptance) {
      this.eventEmitter.emit(
        LEGAL_POLICY_UPDATED_EVENT,
        new LegalPolicyUpdatedEvent(
          created.type,
          created.version,
          created.title,
          created.documentUrl,
          created.effectiveAt,
          created.requiresReacceptance,
          created.changeSummary ?? undefined,
          created.publishedAt,
        ),
      );
    }

    return created as LegalDocumentVersionResponseDto;
  }

  /**
   * Retrieves paginated legal consent history for the authenticated user.
   *
   * @param userId - Unique identifier of the authenticated user.
   * @param query - Pagination options and optional document type filter.
   * @returns Paginated list of user legal consent records.
   */
  async getUserConsentHistory(
    userId: string,
    query?: LegalConsentQueryRequestDto,
  ): Promise<PaginatedUserLegalConsentResponseDto> {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserLegalConsentWhereInput = {
      userId,
      ...(query?.documentType && { documentType: query.documentType }),
    };

    const [total, data] = await Promise.all([
      this.prisma.userLegalConsent.count({ where }),
      this.prisma.userLegalConsent.findMany({
        where,
        orderBy: { acceptedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: data as unknown as UserLegalConsentResponseDto[],
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}
