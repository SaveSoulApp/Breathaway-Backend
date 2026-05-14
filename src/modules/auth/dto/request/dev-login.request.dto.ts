import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DevLoginDto {
  @ApiProperty({ description: 'Dev user identifier for login' })
  @IsString()
  @IsNotEmpty()
  identifier: string;
}
