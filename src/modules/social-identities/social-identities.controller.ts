import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BaseController } from '@core/base/base.controller';
import { SerializeExpose } from '@common/interceptors';
import { LoggerService } from '@core/logger';
import { SocialIdentityResponseDto, VerifyInstagramRequestDto } from './dto';
import { SocialidentityService } from './social-identities.service';

@ApiTags('Social Identity')
@Controller({
  path: 'social-identity',
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
    return this.socialidentityService.verifyInstagramIdentity(
      verifyInstagramDto.instagramId,
    );
  }
}
