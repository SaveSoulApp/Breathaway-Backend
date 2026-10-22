import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class TrendPointDto {
  @ApiProperty({
    description: 'Date timestamp of the interval bucket',
    example: '2026-10-01T00:00:00.000Z',
  })
  date: string;

  @ApiProperty({
    description: 'Primary metric value for this bucket',
    example: 42,
  })
  value: number;

  @ApiPropertyOptional({
    description: 'Secondary metric value for multi-bar comparison',
    example: 12,
  })
  secondaryValue?: number;

  @ApiPropertyOptional({
    description: 'Readable label for the bucket',
    example: 'Oct 01',
  })
  label?: string;
}

export class ReportTrendsResponseDto {
  @ApiProperty({ description: 'Time-series bucket interval', example: 'day' })
  interval: string;

  @ApiProperty({ description: 'Target metric analyzed', example: 'users' })
  metric: string;

  @ApiProperty({ type: [TrendPointDto] })
  @ValidateNested({ each: true })
  @Type(() => TrendPointDto)
  data: TrendPointDto[];
}
