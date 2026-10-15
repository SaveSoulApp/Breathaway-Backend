import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ChatRoomKeyResponseDto {
  @ApiProperty({
    description: 'The unique chat room UUID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @Expose()
  roomId: string;

  @ApiProperty({
    description:
      'Base64-encoded raw 32-byte AES-256 data encryption key for the room',
    example: 'dGhpcy1pcy1hLTMyLWJ5dGUtYWVzLTI1Ni1rZXk=',
  })
  @Expose()
  key: string;

  @ApiProperty({
    description: 'Cipher algorithm identifier',
    example: 'AES-GCM-256',
    default: 'AES-GCM-256',
  })
  @Expose()
  algorithm: string;
}
