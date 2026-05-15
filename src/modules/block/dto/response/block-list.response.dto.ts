import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { BlockResponseDto } from './block.response.dto';

export class BlockListResponseDto {
  @ApiProperty({ type: [BlockResponseDto], description: 'List of active blocks' })
  @Expose()
  @Type(() => BlockResponseDto)
  data: BlockResponseDto[];
}
