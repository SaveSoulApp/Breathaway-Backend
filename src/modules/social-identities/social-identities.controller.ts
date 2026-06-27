import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BaseController } from '@core/base';
import { SerializeExpose } from '@common/interceptors';
import { LoggerService } from '@core/logger';
import { SocialIdentityResponseDto, VerifyInstagramRequestDto } from './dto';
import { SocialidentitiesService } from './social-identities.service';

@ApiTags('Social Identities')
@Controller({
  path: 'social-identities',
  version: ['1'],
})
/**
 * Handles HTTP operations for the /social-identities resource.
 *
 * Endpoints are intentionally public (no JWT guard) so that identity
 * verification can be performed at the pre-onboarding stage, before a user
 * account token is issued.
 */
export class SocialIdentitiesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly socialidentitiesService: SocialidentitiesService,
  ) {
    super(logger);
  }

  /**
   * Verifies an Instagram account and returns its public profile data.
   *
   * Passes `null` as the userId so no audit log is emitted at this stage;
   * callers responsible for linking the verified identity to a user account
   * should call the service directly with the user's ID.
   *
   * @param verifyInstagramDto - Contains the Instagram user ID to verify.
   * @returns Public Instagram profile fields including follower count, verification
   *   status, and follow-back indicators relative to the business account.
   * @throws {BadRequestException} When the Instagram API rejects the provided ID
   *   (e.g., account does not exist or the token lacks permission).
   * @throws {BadGatewayException} When the Instagram Graph API is unreachable or
   *   returns an unexpected network-level error.
   */
  @Post('verify/instagram')
  @ApiOperation({ summary: 'Verify an Instagram user identity' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Instagram identity verified successfully',
    type: SocialIdentityResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or API error',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Error connecting to Instagram validation service',
  })
  @SerializeExpose(SocialIdentityResponseDto)
  async verifyInstagram(
    @Body() verifyInstagramDto: VerifyInstagramRequestDto,
  ): Promise<SocialIdentityResponseDto> {
    return this.socialidentitiesService.verifyInstagramIdentity(
      null,
      verifyInstagramDto.instagramId,
    );
  }
}
