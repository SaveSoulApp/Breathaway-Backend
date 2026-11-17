import { LegalDocumentType } from '@prisma/client';

/**
 * Event name emitted when a legal document is published or updated with material changes.
 */
export const LEGAL_POLICY_UPDATED_EVENT = 'legal.policy.updated';

/**
 * Domain event dispatched when a legal document version is published that requires user awareness or re-acceptance.
 */
export class LegalPolicyUpdatedEvent {
  constructor(
    public readonly documentType: LegalDocumentType,
    public readonly version: string,
    public readonly title: string,
    public readonly documentUrl: string,
    public readonly effectiveAt: Date,
    public readonly requiresReacceptance: boolean,
    public readonly changeSummary?: string,
    public readonly publishedAt: Date = new Date(),
  ) {}
}
