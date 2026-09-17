import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MarkMessagesReadResponseDto {
  @ApiProperty({
    description:
      'Indicates whether the messages were marked as read successfully',
    example: true,
  })
  @Expose()
  success: boolean;
}
