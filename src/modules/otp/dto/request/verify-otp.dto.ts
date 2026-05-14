import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'The One-Time Password to verify',
    example: 'apple-banana-cherry',
  })
  @IsString()
  @IsNotEmpty()
  otp: string;
}
