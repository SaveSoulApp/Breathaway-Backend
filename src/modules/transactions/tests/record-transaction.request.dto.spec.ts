import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RecordTransactionRequestDto } from '../dto/request/record-transaction.request.dto';

describe('RecordTransactionRequestDto', () => {
  const baseValidPayload = {
    gateway: PaymentGateway.RAZORPAY,
    gatewayTransactionId: 'pay_1234567890',
    environment: TransactionEnvironment.PRODUCTION,
    productId: 'likes_10',
    occurredAt: '2026-11-03T12:00:00.000Z',
  };

  it('should pass validation when userPhoneHash is omitted', async () => {
    const dto = plainToInstance(RecordTransactionRequestDto, baseValidPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation for a valid 64-character hex string', async () => {
    const validHex =
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    const dto = plainToInstance(RecordTransactionRequestDto, {
      ...baseValidPayload,
      userPhoneHash: validHex,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation for an uppercase 64-character hex string', async () => {
    const validUpperHex = 'A'.repeat(64);
    const dto = plainToInstance(RecordTransactionRequestDto, {
      ...baseValidPayload,
      userPhoneHash: validUpperHex,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when userPhoneHash is fewer than 64 characters', async () => {
    const shortHex = 'a'.repeat(63);
    const dto = plainToInstance(RecordTransactionRequestDto, {
      ...baseValidPayload,
      userPhoneHash: shortHex,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const error = errors.find((e) => e.property === 'userPhoneHash');
    expect(error?.constraints).toHaveProperty('isLength');
  });

  it('should fail validation when userPhoneHash is more than 64 characters', async () => {
    const longHex = 'a'.repeat(65);
    const dto = plainToInstance(RecordTransactionRequestDto, {
      ...baseValidPayload,
      userPhoneHash: longHex,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const error = errors.find((e) => e.property === 'userPhoneHash');
    expect(error?.constraints).toHaveProperty('isLength');
  });

  it('should fail validation when userPhoneHash contains non-hexadecimal characters', async () => {
    const nonHex = 'z'.repeat(64);
    const dto = plainToInstance(RecordTransactionRequestDto, {
      ...baseValidPayload,
      userPhoneHash: nonHex,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const error = errors.find((e) => e.property === 'userPhoneHash');
    expect(error?.constraints).toHaveProperty('isHexadecimal');
  });
});
