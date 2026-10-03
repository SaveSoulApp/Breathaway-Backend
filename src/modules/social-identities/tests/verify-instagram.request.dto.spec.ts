import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { VerifyInstagramRequestDto } from '../dto/request/verify-instagram.request.dto';

describe('VerifyInstagramRequestDto', () => {
  it('should pass validation for a valid numeric instagramId', async () => {
    const raw = {
      instagramId: '17841400000000000',
    };

    const dto = plainToInstance(VerifyInstagramRequestDto, raw);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.instagramId).toBe('17841400000000000');
  });

  it('should pass validation for min and max allowed numeric digit lengths (5 to 30)', async () => {
    const minDto = plainToInstance(VerifyInstagramRequestDto, {
      instagramId: '12345',
    });
    const maxDto = plainToInstance(VerifyInstagramRequestDto, {
      instagramId: '9'.repeat(30),
    });

    const minErrors = await validate(minDto);
    const maxErrors = await validate(maxDto);

    expect(minErrors).toHaveLength(0);
    expect(maxErrors).toHaveLength(0);
  });

  it('should fail validation when instagramId contains query parameter injection (foo?bar=1)', async () => {
    const raw = {
      instagramId: 'foo?bar=1',
    };

    const dto = plainToInstance(VerifyInstagramRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('instagramId');
    expect(errors[0].constraints?.matches).toBe(
      'instagramId must be a numeric string',
    );
  });

  it('should fail validation when instagramId contains path traversal or sub-path injection (v19.0/me)', async () => {
    const raw = {
      instagramId: 'v19.0/me',
    };

    const dto = plainToInstance(VerifyInstagramRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('instagramId');
    expect(errors[0].constraints?.matches).toBe(
      'instagramId must be a numeric string',
    );
  });

  it('should fail validation when instagramId contains non-numeric characters', async () => {
    const raw = {
      instagramId: 'user_12345',
    };

    const dto = plainToInstance(VerifyInstagramRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('instagramId');
    expect(errors[0].constraints?.matches).toBe(
      'instagramId must be a numeric string',
    );
  });

  it('should fail validation when instagramId is too short (< 5 digits)', async () => {
    const raw = {
      instagramId: '1234',
    };

    const dto = plainToInstance(VerifyInstagramRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('instagramId');
    expect(errors[0].constraints?.matches).toBe(
      'instagramId must be a numeric string',
    );
  });

  it('should fail validation when instagramId is too long (> 30 digits)', async () => {
    const raw = {
      instagramId: '1'.repeat(31),
    };

    const dto = plainToInstance(VerifyInstagramRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('instagramId');
    expect(errors[0].constraints?.matches).toBe(
      'instagramId must be a numeric string',
    );
  });

  it('should fail validation when instagramId is missing or empty', async () => {
    const missingDto = plainToInstance(VerifyInstagramRequestDto, {});
    const emptyDto = plainToInstance(VerifyInstagramRequestDto, {
      instagramId: '',
    });

    const missingErrors = await validate(missingDto);
    const emptyErrors = await validate(emptyDto);

    expect(missingErrors.length).toBeGreaterThan(0);
    expect(emptyErrors.length).toBeGreaterThan(0);
  });
});
