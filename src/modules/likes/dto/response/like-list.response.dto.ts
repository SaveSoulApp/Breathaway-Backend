import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { LikeResponseDto } from './like.response.dto';

/* istanbul ignore next */
export class LikeListResponseDto {
  @ApiProperty({ type: [LikeResponseDto] })
  @Expose()
  @Type(() => LikeResponseDto)
  data: LikeResponseDto[];
}
