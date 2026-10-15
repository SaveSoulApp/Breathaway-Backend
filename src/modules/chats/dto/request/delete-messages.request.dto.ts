import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class DeleteMessagesRequestDto {
  @ApiProperty({
    description: 'Array of message UUIDs to delete from the room',
    example: ['018f3a5e-7a1b-7a3b-9e4a-0a1b2c3d4e5f'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  messageIds: string[];
}
