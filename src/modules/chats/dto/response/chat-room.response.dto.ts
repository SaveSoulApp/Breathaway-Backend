import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class ChatRoomOtherUserDto {
  @ApiProperty({ description: 'The unique user ID of the other participant' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'First name of the participant' })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({
    description: 'Last name of the participant',
    nullable: true,
  })
  @Expose()
  lastName: string | null;
}

export class ChatRoomResponseDto {
  @ApiProperty({ description: 'The unique ID of the chat room' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'ID of the first user in the room' })
  @Expose()
  userOneId: string;

  @ApiProperty({ description: 'ID of the second user in the room' })
  @Expose()
  userTwoId: string;

  @ApiPropertyOptional({
    description:
      'Basic profile information of the other participant in the chat. May be null if the profile could not be loaded.',
    type: () => ChatRoomOtherUserDto,
    nullable: true,
  })
  @Expose()
  @Type(() => ChatRoomOtherUserDto)
  otherUser: ChatRoomOtherUserDto | null;
}
