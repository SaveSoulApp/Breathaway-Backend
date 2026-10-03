import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyInstagramRequestDto {
  @ApiProperty({
    description: 'Instagram numerical user ID',
    example: '17841400000000000',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5,30}$/, {
    message: 'instagramId must be a numeric string',
  })
  instagramId: string;
}
