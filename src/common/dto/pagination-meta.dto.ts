import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ description: 'Current page number' })
  @Expose()
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  @Expose()
  limit: number;

  @ApiProperty({ description: 'Total number of items matching the query' })
  @Expose()
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  @Expose()
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page' })
  @Expose()
  hasNext: boolean;

  @ApiProperty({ description: 'Whether there is a previous page' })
  @Expose()
  hasPrev: boolean;
}
