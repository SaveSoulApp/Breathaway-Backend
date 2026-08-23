import { ApiProperty } from '@nestjs/swagger';

export class CanCreateLikeResponseDto {
  @ApiProperty({
    description: 'Whether the like can be successfully created',
    example: true,
  })
  canCreate: boolean;
}
