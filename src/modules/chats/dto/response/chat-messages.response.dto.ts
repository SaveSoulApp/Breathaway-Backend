import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { MessageResponseDto } from './message.response.dto';

export class ChatMessagesResponseDto {
  @ApiProperty({
    description: 'List of messages in the room',
    type: () => [MessageResponseDto],
  })
  @Expose()
  @Type(() => MessageResponseDto)
  messages: MessageResponseDto[];

  @ApiPropertyOptional({
    description:
      'Cursor timestamp for pagination, or null if no further messages exist',
    nullable: true,
  })
  @Expose()
  nextCursor: string | null;
}
