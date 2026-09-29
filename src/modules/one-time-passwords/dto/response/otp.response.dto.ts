import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class OtpResponseDto {
  @ApiProperty({ description: 'The generated One-Time Password' })
  @Expose()
  otp: string;

  @ApiProperty({
    description:
      'Human-friendly natural language message embedding the OTP slug for Instagram verification',
    example:
      'Hey Breathaway! Linking my Instagram profile. Verification code: rapid-amber-summit. Cheers!',
  })
  @Expose()
  message: string;

  @ApiProperty({ description: 'Expiration time of the OTP in seconds' })
  @Expose()
  expiresIn: number;
}
