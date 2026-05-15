import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseService } from '@core/base/base.service';
import { LoggerService } from '@core/logger/logger.service';
import { SocialIdentityResponseDto } from './dto';

@Injectable()
export class SocialidentityService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
  }

  async verifyInstagramIdentity(
    instagramId: string,
  ): Promise<SocialIdentityResponseDto> {
    const accessToken = this.configService.get<string>(
      'INSTAGRAM_ACCESS_TOKEN',
    );
    if (!accessToken) {
      this.logger.error(
        'INSTAGRAM_ACCESS_TOKEN is not defined in the environment configuration.',
      );
      throw new InternalServerErrorException(
        'Instagram verification is currently unavailable.',
      );
    }

    const url = `https://graph.instagram.com/${instagramId}?fields=id,name,username,profile_pic,is_verified_user,follower_count,is_user_follow_business,is_business_follow_user&access_token=${accessToken}`;

    try {
      this.logger.log(`Fetching identity for instagramId: ${instagramId}`);
      const response = await fetch(url);

      const data = await response.json();

      if (!response.ok) {
        this.logger.warn(
          `Instagram API returned error: ${response.status} - ${JSON.stringify(data)}`,
        );
        // We throw BadRequest if client provided a bad ID/token according to IG, otherwise BadGateway.
        const errorMessage =
          data?.error?.message || 'Failed to verify Instagram identity';
        throw new BadRequestException(`Instagram API Error: ${errorMessage}`);
      }

      // Map to standard response format
      return {
        id: data.id,
        name: data.name,
        username: data.username,
        profilePic: data.profile_pic,
        isVerifiedUser: data.is_verified_user,
        followerCount: data.follower_count,
        isUserFollowBusiness: data.is_user_follow_business,
        isBusinessFollowUser: data.is_business_follow_user,
        platform: 'instagram',
      } as SocialIdentityResponseDto;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Network or unexpected error while calling Instagram API: ${error.message}`,
      );
      throw new BadGatewayException(
        'Error connecting to Instagram validation service.',
      );
    }
  }
}
