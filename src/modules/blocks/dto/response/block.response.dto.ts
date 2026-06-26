import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

/**
 * Embedded profile snapshot of the blocked user; flattened from the nested Prisma profile join.
 */
class BlockedUserDto {
  @ApiProperty({
    description: 'The unique identifier (ULID) of the blocked user',
  })
  @Expose()
  id: string;

  @ApiProperty({ description: 'First name of the blocked user' })
  @Expose()
  firstName: string;

  @ApiProperty({
    description: 'Last name of the blocked user, if available',
    required: false,
  })
  @Expose()
  lastName?: string;
}

/**
 * Response shape for all /blocks endpoints; represents a single active block relationship
 * with the blocked user's basic identity.
 */
export class BlockResponseDto {
  @ApiProperty({
    description: 'The unique identifier (ULID) of the block record',
  })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Timestamp when the block was created' })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Basic profile information of the blocked user',
    type: () => BlockedUserDto,
  })
  @Expose()
  @Type(() => BlockedUserDto)
  blockedUser: BlockedUserDto;
}
