import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BaseController } from 'src/base/controller/base.controller';
import { SerializeExpose } from 'src/common/interceptors';
import { LoggerService } from 'src/core/logger/logger.service';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OtpResponseDto, VerifyOtpDto } from './dto';
import { OtpService } from './otp.service';

@Controller({
  path: 'otp',
  version: ['1'],
})
export class OtpController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly otpService: OtpService,
  ) {
    super(logger);
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @SerializeExpose(OtpResponseDto)
  async generateOtp(@CurrentUserId() userId: string): Promise<OtpResponseDto> {
    const { otp, expiresIn } =
      await this.otpService.generateAndStoreOtp(userId);

    return {
      otp,
      expiresIn,
    };
  }

  @Post('verify')
  async verifyOtp(@Body() body: VerifyOtpDto): Promise<{ userId: string }> {
    const userId = await this.otpService.verifyAndConsumeOtp(body.otp);
    return { userId };
  }
}
