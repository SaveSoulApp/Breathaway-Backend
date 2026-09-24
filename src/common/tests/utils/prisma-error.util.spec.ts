import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { handlePrismaError } from '@common/utils/prisma-error.util';

describe('handlePrismaError', () => {
  it('should throw ConflictException for P2002 error', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '7.8.0' },
    );

    expect(() => handlePrismaError(error)).toThrow(ConflictException);
  });

  it('should throw NotFoundException for P2025 error', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '7.8.0',
    });

    expect(() => handlePrismaError(error)).toThrow(NotFoundException);
  });

  it('should throw BadRequestException for P2003 error', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      { code: 'P2003', clientVersion: '7.8.0' },
    );

    expect(() => handlePrismaError(error)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for P2014 error', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Required relation violation',
      { code: 'P2014', clientVersion: '7.8.0' },
    );

    expect(() => handlePrismaError(error)).toThrow(BadRequestException);
  });

  it('should rethrow unknown PrismaClientKnownRequestError codes', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unknown error code',
      { code: 'P2000', clientVersion: '7.8.0' },
    );

    expect(() => handlePrismaError(error)).toThrow(error);
  });

  it('should rethrow non-Prisma generic errors', () => {
    const genericError = new Error('Generic database connection failure');

    expect(() => handlePrismaError(genericError)).toThrow(genericError);
  });
});
