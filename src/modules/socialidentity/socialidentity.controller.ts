import { Body, Controller, Post } from '@nestjs/common';
import { BaseController } from 'src/base/controller/base.controller';
import { LoggerService } from 'src/core/logger/logger.service';
import { SocialIdentityResponseDto } from './dto/social-identity-response.dto';
import { VerifyInstagramRequestDto } from './dto/verify-instagram.dto';
import { SocialidentityService } from './socialidentity.service';

@Controller({
  path: 'socialidentity',
  version: ['1'],
})
export class SocialidentityController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly socialidentityService: SocialidentityService,
  ) {
    super(logger);
  }

  @Post('verify/instagram')
  async verifyInstagram(
    @Body() verifyInstagramDto: VerifyInstagramRequestDto,
  ): Promise<SocialIdentityResponseDto> {
    this.logger.log(
      `Received request to verify instagram ID: ${verifyInstagramDto.instagramId}`,
    );
    return this.socialidentityService.verifyInstagramIdentity(
      verifyInstagramDto.instagramId,
    );
  }
}
