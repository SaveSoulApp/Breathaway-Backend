import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LegalDocumentType } from '@prisma/client';

import { CreateLegalDocumentVersionRequestDto } from '../dto';

describe('CreateLegalDocumentVersionRequestDto', () => {
  const validHash =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  it('should validate successfully when all fields are valid including 64-char hex contentHash', async () => {
    const dto = plainToInstance(CreateLegalDocumentVersionRequestDto, {
      type: LegalDocumentType.TERMS_OF_SERVICE,
      version: '1.0.0',
      title: 'Terms of Service',
      documentUrl: 'https://breathaway.app/terms',
      contentHash: validHash,
      requiresReacceptance: false,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when contentHash is not 64 hexadecimal characters', async () => {
    const dto = plainToInstance(CreateLegalDocumentVersionRequestDto, {
      type: LegalDocumentType.TERMS_OF_SERVICE,
      version: '1.0.0',
      title: 'Terms of Service',
      documentUrl: 'https://breathaway.app/terms',
      contentHash: 'short-hash-123',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const hashError = errors.find((e) => e.property === 'contentHash');
    expect(hashError).toBeDefined();
    expect(hashError?.constraints?.matches).toContain(
      'contentHash must be a valid 64-character SHA-256 hexadecimal digest',
    );
  });

  it('should fail validation when contentHash contains non-hex characters', async () => {
    const dto = plainToInstance(CreateLegalDocumentVersionRequestDto, {
      type: LegalDocumentType.TERMS_OF_SERVICE,
      version: '1.0.0',
      title: 'Terms of Service',
      documentUrl: 'https://breathaway.app/terms',
      contentHash: 'z'.repeat(64),
    });

    const errors = await validate(dto);
    const hashError = errors.find((e) => e.property === 'contentHash');
    expect(hashError).toBeDefined();
  });
});
