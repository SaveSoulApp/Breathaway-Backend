import { IsEnum, IsString } from 'class-validator';

export enum SocialAuthType {
  INSTAGRAM = 'INSTAGRAM',
  LINKEDIN = 'LINKEDIN',
  TWITTER = 'TWITTER',
  OTHER = 'OTHER',
}

export class SocialAuthDto {
  @IsEnum(SocialAuthType)
  type: SocialAuthType;

  @IsString()
  platformUserId: string;

  @IsString()
  handle: string;
}
