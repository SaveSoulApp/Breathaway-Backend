import { LegalDocumentType } from '@prisma/client';

/**
 * Metadata configuration for legal documents.
 */
export interface LegalDocumentMetadata {
  readonly type: LegalDocumentType;
  readonly title: string;
  readonly isMandatoryForSignup: boolean;
  readonly defaultWebPath: string;
}

/**
 * Single source of truth for legal document definitions, display titles,
 * signup enforcement flags, and static frontend URL paths.
 */
export const LEGAL_DOCUMENTS_METADATA: Readonly<
  Record<LegalDocumentType, LegalDocumentMetadata>
> = {
  [LegalDocumentType.TERMS_OF_SERVICE]: {
    type: LegalDocumentType.TERMS_OF_SERVICE,
    title: 'Terms and Conditions',
    isMandatoryForSignup: true,
    defaultWebPath: '/terms',
  },
  [LegalDocumentType.PRIVACY_POLICY]: {
    type: LegalDocumentType.PRIVACY_POLICY,
    title: 'Privacy Policy',
    isMandatoryForSignup: true,
    defaultWebPath: '/privacy',
  },
  [LegalDocumentType.CANCELLATION_POLICY]: {
    type: LegalDocumentType.CANCELLATION_POLICY,
    title: 'Cancellation and Refund Policy',
    isMandatoryForSignup: true,
    defaultWebPath: '/cancellation-and-refund',
  },
};

/**
 * Filtered array of legal document types marked as mandatory for customer account registration.
 * Synchronized automatically from `LEGAL_DOCUMENTS_METADATA`.
 */
export const MANDATORY_SIGNUP_DOCUMENTS: readonly LegalDocumentType[] =
  Object.values(LEGAL_DOCUMENTS_METADATA)
    .filter((doc) => doc.isMandatoryForSignup)
    .map((doc) => doc.type);
