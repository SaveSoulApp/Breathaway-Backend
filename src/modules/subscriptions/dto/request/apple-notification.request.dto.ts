import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AppleNotificationRequestDto {
  @ApiProperty({
    description:
      'JWS signed payload from Apple App Store Server Notifications v2',
  })
  @IsString()
  signedPayload: string;
}
