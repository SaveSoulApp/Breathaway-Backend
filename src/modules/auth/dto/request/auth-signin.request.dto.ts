import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthSigninDto {
  @ApiProperty({
    description: 'Firebase UID token or OTP token for verification',
  })
  @IsString()
  @IsNotEmpty()
  uidToken: string;

  @ApiProperty({
    description: 'User identifier (e.g., phone number or email) to sign in',
  })
  @IsString()
  @IsNotEmpty()
  uid: string;
}
