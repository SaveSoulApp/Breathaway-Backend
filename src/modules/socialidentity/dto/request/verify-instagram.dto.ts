import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyInstagramRequestDto {
  @ApiProperty({
    description: 'Instagram numerical user ID',
    example: '17841400000000000',
  })
  @IsString()
  @IsNotEmpty()
  instagramId: string;
}
