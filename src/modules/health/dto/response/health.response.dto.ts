import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class HealthResponseDto {
  @ApiProperty({ description: 'Health status indicator', example: 'ok' })
  @Expose()
  status: string;
}
