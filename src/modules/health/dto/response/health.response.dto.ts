import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class HealthResponseDto {
  @ApiProperty({
    description: 'Overall health status indicator',
    example: 'ok',
    enum: ['ok', 'error', 'shutting_down'],
  })
  @Expose()
  status: string;

  @ApiPropertyOptional({
    description: 'Detailed metrics of successful health checks',
    example: {
      memory_heap: { status: 'up' },
      memory_rss: { status: 'up' },
    },
  })
  @Expose()
  info?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Detailed errors of failed health checks',
    example: {},
  })
  @Expose()
  error?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Comprehensive results of all executed checks',
    example: {
      memory_heap: { status: 'up' },
      memory_rss: { status: 'up' },
    },
  })
  @Expose()
  details?: Record<string, unknown>;
}
