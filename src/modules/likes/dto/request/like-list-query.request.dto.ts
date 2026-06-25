import { IntentType, LikeStatus } from '@prisma/client';
import { SortOrder } from '@common/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for GET /likes — controls pagination, filtering, and sort order.
 *
 * All fields are optional; defaults are applied by NestJS when omitted.
 * `page` and `limit` are coerced from query strings to integers by the `@Transform` decorator.
 */
export class LikeListQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiPropertyOptional({ enum: IntentType, description: 'Filter by intent' })
  @IsOptional()
  @IsEnum(IntentType)
  intent?: IntentType;

  @ApiPropertyOptional({ enum: LikeStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(LikeStatus)
  status?: LikeStatus;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}
