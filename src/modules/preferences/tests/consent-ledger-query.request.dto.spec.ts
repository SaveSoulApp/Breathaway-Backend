import { ConsentChannel } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ConsentLedgerQueryRequestDto } from '../dto/request/consent-ledger-query.request.dto';

describe('ConsentLedgerQueryRequestDto', () => {
  it('should use default values when no query params are provided', async () => {
    const dto = plainToInstance(ConsentLedgerQueryRequestDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.channel).toBeUndefined();
  });

  it('should correctly transform query string numbers to numeric integers', async () => {
    const dto = plainToInstance(ConsentLedgerQueryRequestDto, {
      page: '3',
      limit: '50',
      channel: ConsentChannel.EMAIL,
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
    expect(dto.channel).toBe(ConsentChannel.EMAIL);
  });

  it('should allow valid channel enums', async () => {
    const dto = plainToInstance(ConsentLedgerQueryRequestDto, {
      channel: ConsentChannel.WHATSAPP,
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.channel).toBe(ConsentChannel.WHATSAPP);
  });

  it('should fail validation when channel is not a valid ConsentChannel enum value', async () => {
    const dto = plainToInstance(ConsentLedgerQueryRequestDto, {
      channel: 'INVALID_CHANNEL',
    });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('channel');
  });

  it('should fail validation when page is less than 1', async () => {
    const dto = plainToInstance(ConsentLedgerQueryRequestDto, {
      page: 0,
    });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
  });

  it('should fail validation when limit is less than 1 or greater than 100', async () => {
    const tooLow = plainToInstance(ConsentLedgerQueryRequestDto, {
      limit: 0,
    });
    const tooHigh = plainToInstance(ConsentLedgerQueryRequestDto, {
      limit: 101,
    });

    const errorsLow = await validate(tooLow);
    const errorsHigh = await validate(tooHigh);

    expect(errorsLow.length).toBeGreaterThan(0);
    expect(errorsLow[0].property).toBe('limit');

    expect(errorsHigh.length).toBeGreaterThan(0);
    expect(errorsHigh[0].property).toBe('limit');
  });

  it('should fail validation when page or limit is not an integer', async () => {
    const nonIntDto = plainToInstance(ConsentLedgerQueryRequestDto, {
      page: 'not-a-number',
      limit: '12.34',
    });
    const errors = await validate(nonIntDto);

    expect(errors.length).toBeGreaterThan(0);
    const properties = errors.map((e) => e.property);
    expect(properties).toContain('page');
    expect(properties).toContain('limit');
  });
});
