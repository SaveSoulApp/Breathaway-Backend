import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendInstagramMessageRequestDto {
  @ApiProperty({
    description: 'Instagram-Scoped ID (IGSID) of the recipient user',
    example: '17841400008460056',
  })
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @ApiProperty({
    description: 'Text content of the message to send',
    example: 'Your identity has been verified on BreathAway! 🎉',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text: string;
}
