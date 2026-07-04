import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { AuditActionType } from '@modules/audit/dto';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { DomainException } from '@shared/domain/exceptions/domain.exception';
import { SocialIdentityResponseDto } from './dto';
import {
  MissingSocialIdentityConfigException,
  SocialIdentityApiException,
  SocialIdentityNetworkException,
} from './application/exceptions';

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
    // instagramId is an opaque numeric platform ID — safe to include in ctx.
    // userId may be null in pre-auth flows; log the boolean presence instead.
    const ctx = { instagramId, hasUserId: userId !== null };
    this.logger.log('Instagram identity verification started', { ...ctx, step: 'init' });

    const accessToken = this.configService.get<string>('INSTAGRAM_ACCESS_TOKEN');
    if (!accessToken) {
      this.logger.error('INSTAGRAM_ACCESS_TOKEN not configured', { ...ctx, step: 'config_check' });
      throw new MissingSocialIdentityConfigException();
    }
    this.logger.debug('Config check passed', { ...ctx, step: 'config_check' });

    const url = `https://graph.instagram.com/${instagramId}?fields=id,name,username,profile_pic,is_verified_user,follower_count,is_user_follow_business,is_business_follow_user&access_token=${accessToken}`;

    try {
      this.logger.debug('Calling Instagram Graph API', { ...ctx, step: 'api_call' });
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
        // Log only the API status and sanitized error message — not the full
        // data payload which may contain name/username (PII from Instagram).
        this.logger.warn('Instagram API returned an error response', {
          ...ctx,
          step: 'api_call',
          apiStatus: response.status,
          apiErrorMessage: data?.error?.message ?? 'unknown',
        });
        const errorMessage =
          data?.error?.message || 'Failed to verify Instagram identity';
        throw new SocialIdentityApiException(
          `Instagram API Error: ${errorMessage}`,
        );
      }
      this.logger.debug('Instagram API call succeeded', {
        ...ctx,
        step: 'api_call',
        apiStatus: response.status,
        isVerifiedUser: data.is_verified_user ?? false,
      });

      if (userId) {
        this.emitAuditLog({
          actionType: AuditActionType.SOCIAL_IDENTITY_VERIFIED,
          userId: userId,
          metadata: {
            platform: 'instagram',
            maskedPlatformId: instagramId,
          },
        });
      }

      this.logger.log('Instagram identity verification complete', { ...ctx, step: 'complete' });

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
    } catch (err) {
      // Re-throw domain exceptions (SocialIdentityApiException) without
      // double-logging — the warn was already emitted above.
      if (err instanceof DomainException) throw err;
      this.logger.error('Network or unexpected error calling Instagram API', {
        ...ctx,
        step: 'api_call',
        err: serializeError(err),
      });
      throw new SocialIdentityNetworkException();
    }
  }
}
