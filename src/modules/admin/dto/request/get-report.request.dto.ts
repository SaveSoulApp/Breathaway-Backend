import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class GetReportRequestDto {
  @ApiPropertyOptional({
    description: 'Start date of the timeframe to generate the report for',
    example: '2023-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date of the timeframe to generate the report for',
    example: '2023-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
