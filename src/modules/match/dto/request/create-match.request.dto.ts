import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateMatchDto {
  @ApiProperty({ description: 'The ID of the first like' })
  @IsString()
  @IsNotEmpty()
  likeOneId: string;

  @ApiProperty({ description: 'The ID of the second like' })
  @IsString()
  @IsNotEmpty()
  likeTwoId: string;
}
