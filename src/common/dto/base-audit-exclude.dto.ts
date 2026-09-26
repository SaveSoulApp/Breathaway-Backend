import { Exclude } from 'class-transformer';

/**
 * Base DTO that explicitly marks internal database audit metadata for exclusion.
 *
 * Inheriting response DTOs or entities will automatically prevent internal
 * audit timestamps and soft-deletion flags from leaking into serialized responses,
 * providing defense-in-depth across all class-transformer serialization strategies.
 */
export abstract class BaseAuditExcludeDto {
  @Exclude()
  createdAt?: Date;

  @Exclude()
  updatedAt?: Date;

  @Exclude()
  deletedAt?: Date | null;
}
