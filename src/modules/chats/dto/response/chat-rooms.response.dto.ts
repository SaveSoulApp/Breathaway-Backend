import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { ChatRoomResponseDto } from './chat-room.response.dto';

export class ChatRoomsResponseDto {
  @ApiProperty({
    description: 'List of chat rooms',
    type: () => [ChatRoomResponseDto],
  })
  @Expose()
  @Type(() => ChatRoomResponseDto)
  rooms: ChatRoomResponseDto[];
}
