import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class DeleteMessagesResponseDto {
  @ApiProperty({
    description: 'Indicates whether the messages were deleted successfully',
    example: true,
  })
  @Expose()
  success: boolean;

  @ApiProperty({
    description: 'Number of messages deleted',
    example: 1,
  })
  @Expose()
  deletedCount: number;
}
