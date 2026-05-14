import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class OtpResponseDto {
  @ApiProperty({ description: 'The generated One-Time Password' })
  @Expose()
  otp: string;

  @ApiProperty({ description: 'Expiration time of the OTP in seconds' })
  @Expose()
  expiresIn: number;
}
