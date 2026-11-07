import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * Request payload for POST /identities/email/send-otp.
 *
 * Initiates the email verification workflow by dispatching a short-lived,
 * single-use numeric OTP to the specified email address via Brevo.
 */
export class SendEmailOtpRequestDto {
  @ApiProperty({
    description: 'Email address to verify and link to the user account',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Must be a valid email address' })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}
