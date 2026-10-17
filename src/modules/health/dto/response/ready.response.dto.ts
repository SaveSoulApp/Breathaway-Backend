import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ReadyResponseDto {
  @ApiProperty({
    description: 'Overall service readiness indicator',
    example: 'ok',
    enum: ['ok', 'error', 'shutting_down'],
  })
  @Expose()
  status: string;

  @ApiPropertyOptional({
    description: 'Detailed diagnostic info for dependency checks',
    example: {
      database: { status: 'up' },
      redis: { status: 'up' },
    },
  })
  @Expose()
  info?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Detailed failure metrics when readiness checks fail',
    example: {},
  })
  @Expose()
  error?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Comprehensive results of all executed checks',
    example: {
      database: { status: 'up' },
      redis: { status: 'up' },
    },
  })
  @Expose()
  details?: Record<string, unknown>;
}
