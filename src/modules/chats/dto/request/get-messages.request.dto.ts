import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetMessagesRequestDto {
  @ApiPropertyOptional({
    description: 'Fetch messages older than this timestamp (cursor)',
  })
  @IsDateString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of messages to retrieve',
    default: 20,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
