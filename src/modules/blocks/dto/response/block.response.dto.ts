import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { BaseAuditExcludeDto } from '@common/dto';

/**
 * Embedded profile snapshot of the blocked user; flattened from the nested Prisma profile join.
 */
class BlockedUserDto {
  @ApiPropertyOptional({
    description:
      'The unique identifier (ULID) of the blocked user, or null if deleted',
    nullable: true,
  })
  @Expose()
  id: string | null;

  @ApiPropertyOptional({
    description: 'First name of the blocked user',
    nullable: true,
  })
  @Expose()
  firstName: string | null;

  @ApiPropertyOptional({
    description: 'Last name of the blocked user, if available',
    required: false,
    nullable: true,
  })
  @Expose()
  lastName?: string | null;

  @ApiPropertyOptional({
    description: 'Indicates whether the blocked user has deleted their account',
    example: false,
  })
  @Expose()
  isDeleted?: boolean;
}

/**
 * Response shape for all /blocks endpoints; represents a single active block relationship
 * with the blocked user's basic identity.
 */
export class BlockResponseDto extends BaseAuditExcludeDto {
  @ApiProperty({
    description: 'The unique identifier (ULID) of the block record',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Basic profile information of the blocked user',
    type: () => BlockedUserDto,
  })
  @Expose()
  @Type(() => BlockedUserDto)
  blockedUser: BlockedUserDto;
}
