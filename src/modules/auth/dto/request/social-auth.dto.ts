import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export enum SocialAuthType {
  INSTAGRAM = 'INSTAGRAM',
  LINKEDIN = 'LINKEDIN',
  TWITTER = 'TWITTER',
  OTHER = 'OTHER',
}

export class SocialAuthDto {
  @ApiProperty({
    description: 'The social platform used for auth',
    enum: SocialAuthType,
  })
  @IsEnum(SocialAuthType)
  type: SocialAuthType;

  @ApiProperty({ description: 'User ID from the social platform' })
  @IsString()
  platformUserId: string;

  @ApiProperty({ description: 'User handle/username from the social platform' })
  @IsString()
  handle: string;
}
