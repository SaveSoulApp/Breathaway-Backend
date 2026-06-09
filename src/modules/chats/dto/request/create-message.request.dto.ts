import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateMessageRequestDto {
  @ApiProperty({ description: 'The ID of the user to send the message to' })
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @ApiProperty({ description: 'The text content of the message' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
