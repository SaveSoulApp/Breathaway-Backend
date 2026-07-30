import { ApiProperty } from '@nestjs/swagger';

export class ChatRoomResponseDto {
  @ApiProperty({ description: 'The unique ID of the chat room' })
  id: string;

  @ApiProperty({ description: 'ID of the first user in the room' })
  userOneId: string;

  @ApiProperty({ description: 'ID of the second user in the room' })
  userTwoId: string;
}
