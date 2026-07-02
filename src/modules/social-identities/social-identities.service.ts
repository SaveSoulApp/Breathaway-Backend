import {
  Injectable,
} from '@nestjs/common';
import { MissingSocialIdentityConfigException, SocialIdentityApiException, SocialIdentityNetworkException } from './application/exceptions';
import { ConfigService } from '@nestjs/config';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { AuditActionType } from '@modules/audit/dto';
import { SocialIdentityResponseDto } from './dto';

/**
 * Integrates with third-party social platforms to verify that a claimed
 * identity belongs to a real, active account.
 *
 * Currently supports Instagram via the Instagram Graph API. Verification is
 * purely read-only — no data is persisted; callers are responsible for
 * storing or linking the verified identity after a successful response.
 */
@Injectable()
export class SocialidentitiesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
  }

  /**
   * Fetches and validates an Instagram account against the Graph API,
   * returning a normalised profile snapshot.
   *
   * When `userId` is provided, an audit event is emitted to record that this
   * user performed a social identity verification. Pass `null` during
   * pre-authentication flows where no user session exists yet.
   *
   * @param userId - ID of the authenticated user initiating verification, or
   *                 `null` to skip audit logging.
   * @param instagramId - The Instagram user ID (numeric string) to verify.
   * @returns A normalised profile DTO including follower count, verification
   *   badge, and mutual follow status relative to the business account.
   * @throws {InternalServerErrorException} When `INSTAGRAM_ACCESS_TOKEN` is
   *   absent from the environment configuration.
   * @throws {BadRequestException} When the Instagram API responds with a
   *   client-level error (e.g., invalid ID, insufficient permissions).
   * @throws {BadGatewayException} When a network or unexpected error occurs
   *   while communicating with the Instagram Graph API.
   */
  async verifyInstagramIdentity(
    userId: string | null,
    instagramId: string,
  ): Promise<SocialIdentityResponseDto> {
    const accessToken = this.configService.get<string>(
      'INSTAGRAM_ACCESS_TOKEN',
    );
    if (!accessToken) {
      this.logger.error(
        'INSTAGRAM_ACCESS_TOKEN is not defined in the environment configuration.',
      );
      throw new MissingSocialIdentityConfigException();
    }

    const url = `https://graph.instagram.com/${instagramId}?fields=id,name,username,profile_pic,is_verified_user,follower_count,is_user_follow_business,is_business_follow_user&access_token=${accessToken}`;

    try {
      this.logger.log(`Fetching identity for instagramId: ${instagramId}`);
      const response = await fetch(url);

      const data = (await response.json()) as {
        id?: string;
        name?: string;
        username?: string;
        profile_pic?: string;
        is_verified_user?: boolean;
        follower_count?: number;
        is_user_follow_business?: boolean;
        is_business_follow_user?: boolean;
        error?: { message?: string };
      };

      if (!response.ok) {
        this.logger.warn(
          `Instagram API returned error: ${response.status} - ${JSON.stringify(data)}`,
        );
        // We throw BadRequest if client provided a bad ID/token according to IG, otherwise BadGateway.
        const errorMessage =
          data?.error?.message || 'Failed to verify Instagram identity';
        throw new SocialIdentityApiException(`Instagram API Error: ${errorMessage}`);
      }

      if (userId) {
        this.emitAuditLog({
          actionType: AuditActionType.SOCIAL_IDENTITY_VERIFIED,
          userId: userId,
          metadata: {
            platform: 'instagram',
            maskedPlatformId: instagramId, // The handle/ID used
          },
        });
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
      if (error instanceof SocialIdentityApiException) {
        throw error;
      }
      this.logger.error(
        `Network or unexpected error while calling Instagram API: ${(error as Error).message}`,
      );
      throw new SocialIdentityNetworkException();
    }
  }
}
