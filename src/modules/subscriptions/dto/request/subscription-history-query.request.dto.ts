import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for GET /subscriptions/me/history — controls pagination of the caller's
 * subscription history.
 *
 * All fields are optional; defaults are applied when omitted.
 * `page` and `limit` are coerced from query strings to integers by the `@Transform` decorator.
 */
export class SubscriptionHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  limit?: number = 20;
}
