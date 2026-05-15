import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BaseController } from 'src/base/controller/base.controller';
import { SerializeExpose } from 'src/common/interceptors';
import { LoggerService } from 'src/core/logger/logger.service';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OtpResponseDto, VerifyOtpDto, VerifyOtpResponseDto } from './dto';
import { OtpService } from './one-time-passwords.service';

@ApiTags('OTP')
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
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate a new OTP for the current user' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'OTP generated successfully',
    type: OtpResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded for generating OTP',
  })
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
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify an OTP' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'OTP verified successfully',
    type: VerifyOtpResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired OTP',
  })
  @SerializeExpose(VerifyOtpResponseDto)
  async verifyOtp(@Body() body: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    const userId = await this.otpService.verifyAndConsumeOtp(body.otp);
    return { userId };
  }
}
