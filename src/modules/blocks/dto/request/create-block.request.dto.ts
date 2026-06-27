import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload for POST /blocks; identifies the target user to block.
 * The blocker identity is derived from the JWT, not this DTO.
 */
export class CreateBlockDto {
  @ApiProperty({
    description: 'The unique identifier (ULID) of the user to block',
  })
  @IsString()
  @IsNotEmpty()
  blockedUserId: string;
}
