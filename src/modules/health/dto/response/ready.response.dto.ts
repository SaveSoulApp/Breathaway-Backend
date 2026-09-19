import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ReadyResponseDto {
  @ApiProperty({ description: 'Health status indicator', example: 'ok' })
  @Expose()
  status: string;

  @ApiProperty({
    description: 'Database connection status',
    example: 'connected',
  })
  @Expose()
  db: string;
}
