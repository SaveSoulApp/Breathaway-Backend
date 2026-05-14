import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class VerifyOtpResponseDto {
  @ApiProperty({ description: 'The ID of the verified user' })
  @Expose()
  userId: string;
}
