import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBlockDto {
  @ApiProperty({
    description: 'The unique identifier (ULID) of the user to block',
  })
  @IsString()
  @IsNotEmpty()
  blockedUserId: string;
}
