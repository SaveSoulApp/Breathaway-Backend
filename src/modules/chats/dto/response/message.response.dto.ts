import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MessageResponseDto {
  @ApiProperty({
    description: 'The unique message UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'The chat room UUID to which the message belongs',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  roomId: string;

  @ApiProperty({
    description: 'The user ID of the message sender',
    example: '01H72YZP8K1234567890ABCDEF',
  })
  @Expose()
  senderId: string;

  @ApiProperty({
    description: 'Text content of the message',
    example: 'Hello, how are you?',
  })
  @Expose()
  content: string;

  @ApiProperty({
    description: 'Timestamp when the message was sent',
  })
  @Expose()
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Timestamp when the message was read, or null if unread',
    nullable: true,
  })
  @Expose()
  readAt: Date | null;
}
