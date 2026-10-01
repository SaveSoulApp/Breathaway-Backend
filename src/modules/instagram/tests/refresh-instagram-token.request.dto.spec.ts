import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RefreshInstagramTokenRequestDto } from '../dto/request/refresh-instagram-token.request.dto';

describe('RefreshInstagramTokenRequestDto', () => {
  it('should pass validation for a valid token', async () => {
    const raw = {
      token: 'IGQWRPvalidAccessToken1234567890',
    };

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.token).toBe('IGQWRPvalidAccessToken1234567890');
  });

  it('should trim surrounding whitespace from token', async () => {
    const raw = {
      token: '   IGQWRPvalidAccessToken1234567890   ',
    };

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.token).toBe('IGQWRPvalidAccessToken1234567890');
  });

  it('should fail validation when token is missing', async () => {
    const raw = {};

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('token');
  });

  it('should fail validation when token is empty string', async () => {
    const raw = {
      token: '',
    };

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('token');
  });

  it('should fail validation when token is whitespace only', async () => {
    const raw = {
      token: '     ',
    };

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('token');
  });

  it('should fail validation when token is too short (< 10 characters)', async () => {
    const raw = {
      token: 'short',
    };

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('token');
    expect(errors[0].constraints?.minLength).toBeDefined();
  });

  it('should fail validation when token exceeds max length (> 1024 characters)', async () => {
    const raw = {
      token: 'a'.repeat(1025),
    };

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('token');
    expect(errors[0].constraints?.maxLength).toBeDefined();
  });

  it('should fail validation when token is not a string', async () => {
    const raw = {
      token: 1234567890,
    };

    const dto = plainToInstance(RefreshInstagramTokenRequestDto, raw);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('token');
    expect(errors[0].constraints?.isString).toBeDefined();
  });
});
