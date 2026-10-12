import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QueryPriceHistoryRequestDto } from '../dto/request/query-price-history.request.dto';

describe('QueryPriceHistoryRequestDto', () => {
  it('should use default values when no query params are provided', async () => {
    const dto = plainToInstance(QueryPriceHistoryRequestDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(100);
    expect(dto.sortOrder).toBe('desc');
  });

  it('should validate valid custom pagination and sort order', async () => {
    const dto = plainToInstance(QueryPriceHistoryRequestDto, {
      page: 2,
      limit: 50,
      sortOrder: 'asc',
      countryCode: 'IN',
      currencyCode: 'INR',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(dto.sortOrder).toBe('asc');
  });

  it('should fail validation when limit exceeds 100', async () => {
    const tooHigh = plainToInstance(QueryPriceHistoryRequestDto, {
      limit: 101,
    });
    const errorsHigh = await validate(tooHigh);

    expect(errorsHigh.length).toBeGreaterThan(0);
    expect(errorsHigh[0].constraints).toHaveProperty('max');
  });

  it('should fail validation when limit is below 1', async () => {
    const tooLow = plainToInstance(QueryPriceHistoryRequestDto, { limit: 0 });
    const errorsLow = await validate(tooLow);

    expect(errorsLow.length).toBeGreaterThan(0);
    expect(errorsLow[0].constraints).toHaveProperty('min');
  });

  it('should fail validation when page is below 1', async () => {
    const invalidPage = plainToInstance(QueryPriceHistoryRequestDto, {
      page: 0,
    });
    const errors = await validate(invalidPage);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should fail validation when sortOrder is neither asc nor desc', async () => {
    const invalidSort = plainToInstance(QueryPriceHistoryRequestDto, {
      sortOrder: 'invalid',
    });
    const errors = await validate(invalidSort);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });
});
