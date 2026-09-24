import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class CanCreateLikeResponseDto {
  @ApiProperty({
    description: 'Whether the like can be successfully created',
    example: true,
  })
  @Expose()
  canCreate: boolean;
}
