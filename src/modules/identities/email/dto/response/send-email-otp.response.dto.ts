import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response payload returned upon successful OTP dispatch for email verification.
 */
export class SendEmailOtpResponseDto {
  @ApiProperty({
    description: 'Human-readable confirmation message',
    example: 'Verification code sent to email',
  })
  @Expose()
  message: string;

  @ApiProperty({
    description: 'Number of seconds the verification code remains valid',
    example: 600,
  })
  @Expose()
  expiresIn: number;

  @ApiProperty({
    description:
      'Number of seconds the client must wait before requesting a new OTP',
    example: 60,
  })
  @Expose()
  resendAfter: number;
}
