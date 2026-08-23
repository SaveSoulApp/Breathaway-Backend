import { ApiProperty } from '@nestjs/swagger';

export class ChatRoomResponseDto {
  @ApiProperty({ description: 'The unique ID of the chat room' })
  id: string;

  @ApiProperty({ description: 'ID of the first user in the room' })
  userOneId: string;

  @ApiProperty({ description: 'ID of the second user in the room' })
  userTwoId: string;

  @ApiProperty({
    description:
      'Basic profile information of the other participant in the chat. May be null if the profile could not be loaded.',
    example: {
      id: '01H...XYZ',
      firstName: 'John',
      lastName: 'Doe',
    },
    nullable: true,
  })
  otherUser: {
    id: string;
    firstName: string;
    lastName: string | null;
  } | null;
}
