import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response payload carrying the number of notifications updated in a batch read operation.
 */
export class BatchReadResponseDto {
  @ApiProperty({
    description: 'Number of notifications successfully marked as read',
    example: 4,
  })
  @Expose()
  updatedCount: number;
}
