import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for `GET /preferences/consents`; supports standard offset-based
 * pagination and optional filtering by communication channel.
 */
export class ConsentLedgerQueryRequestDto {
  /** Page number for pagination (1-based index). */
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Number of ledger records returned per page. */
  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Optional filter to retrieve consent events for a specific channel only. */
  @ApiPropertyOptional({
    description: 'Filter consent history by communication channel',
    enum: ConsentChannel,
  })
  @IsOptional()
  @IsEnum(ConsentChannel)
  channel?: ConsentChannel;
}
