import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Maps Prisma's raw error codes to NestJS HTTP exceptions.
 * Prevents internal database structure and error details from leaking to the client.
 *
 * @param error - The caught exception from a Prisma operation
 * @throws {ConflictException} For P2002 (Unique constraint)
 * @throws {NotFoundException} For P2025 (Record not found)
 * @throws {BadRequestException} For P2003/P2014 (Relation violations)
 */
export function handlePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        throw new ConflictException('A record with this value already exists');
      case 'P2025':
        throw new NotFoundException('Record not found');
      case 'P2003':
      case 'P2014':
        throw new BadRequestException('Invalid relation reference');
    }
  }
  // Re-throw unknown errors so the global filter handles them as 500s
  throw error;
}
