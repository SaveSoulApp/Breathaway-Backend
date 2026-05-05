import { Expose } from 'class-transformer';

export class OtpResponseDto {
  @Expose()
  otp: string;

  @Expose()
  expiresIn: number;
}
