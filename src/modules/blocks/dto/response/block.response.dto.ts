import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

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
