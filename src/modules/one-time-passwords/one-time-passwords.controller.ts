import { ApiStandardErrors } from '@common/decorators';
import { CurrentUserId } from '@common/decorators/current-user-id.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OtpResponseDto, VerifyOtpDto, VerifyOtpResponseDto } from './dto';
import { OneTimePasswordsService } from './one-time-passwords.service';

@ApiTags('One Time Passwords')
@ApiStandardErrors()
@Controller({
  path: 'one-time-passwords',
  version: ['1'],
})
/**
 * Handles HTTP operations for the /one-time-passwords resource.
 *
 * All endpoints require a valid JWT — OTPs are bound to the authenticated
 * user's ID and are used to generate short-lived, single-use tokens for
 * cross-device identity bridging (e.g., a web client passing a session token
 * to a mobile app).
 */
export class OneTimePasswordsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly oneTimePasswordsService: OneTimePasswordsService,
  ) {
    super(logger);
  }

  /**
   * Generates a new OTP for the authenticated user and stores it in Redis
   * with a configurable TTL.
   *
   * A rate limit window prevents users from requesting OTPs faster than the
   * configured `OTP_RATE_LIMIT_TTL` interval. The plain-text OTP is returned
   * once and never stored — only its hash is persisted in Redis.
   *
   * @returns The generated OTP string and its TTL in seconds.
   * @throws {OtpRateLimitExceededException} When the user has already generated an OTP
   *   within the active rate-limit window.
   */
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
      await this.oneTimePasswordsService.generateAndStoreOtp(userId);

    return {
      otp,
      expiresIn,
    };
  }

  /**
   * Verifies and consumes a plaintext OTP, returning the user ID it was issued to.
   *
   * The OTP is deleted from Redis immediately upon successful verification,
   * making it single-use. The response user ID is the authoritative identifier
   * for the user who originally generated the token.
   *
   * @param body - Contains the plaintext OTP string to verify.
   * @returns The user ID associated with the verified OTP.
   * @throws {InvalidOtpException} When the OTP does not exist in Redis (never
   *   issued, already consumed, or expired).
   */
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
    const userId = await this.oneTimePasswordsService.verifyAndConsumeOtp(
      body.otp,
    );
    return { userId };
  }
}
