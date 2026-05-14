import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class SocialIdentityResponseDto {
  @ApiProperty({ description: 'Platform specific numerical user ID' })
  @Expose()
  id: string;

  @ApiPropertyOptional({ description: 'Full name of the user' })
  @Expose()
  name?: string;

  @ApiPropertyOptional({ description: 'Username of the user' })
  @Expose()
  username?: string;

  @ApiPropertyOptional({ description: 'Profile picture URL' })
  @Expose()
  profilePic?: string;

  @ApiPropertyOptional({ description: 'Whether the user is verified' })
  @Expose()
  isVerifiedUser?: boolean;

  @ApiPropertyOptional({ description: 'Number of followers the user has' })
  @Expose()
  followerCount?: number;

  @ApiPropertyOptional({ description: 'Whether the user follows the business' })
  @Expose()
  isUserFollowBusiness?: boolean;

  @ApiPropertyOptional({ description: 'Whether the business follows the user' })
  @Expose()
  isBusinessFollowUser?: boolean;

  @ApiProperty({ description: 'The platform name, e.g., "instagram"' })
  @Expose()
  platform: string;
}
