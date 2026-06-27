import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class MarkMessageReadRequestDto {
  @ApiProperty({ description: 'The ID of the latest message seen by the user' })
  @IsUUID()
  @IsNotEmpty()
  messageId: string;
}
