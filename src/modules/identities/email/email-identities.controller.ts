import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AUTH_STRICT_THROTTLE } from '@modules/auth/constants';
import { IdentityResponseDto } from '@modules/identities/dto';

import {
  SendEmailOtpRequestDto,
  SendEmailOtpResponseDto,
  VerifyEmailOtpRequestDto,
} from './dto';
import { EmailVerificationService } from './email-verification.service';

/**
 * Handles HTTP operations for email identity verification and linking.
 *
 * All endpoints require a valid user JWT. Endpoints are strictly throttled
 * to protect against automated abuse and cost exhaustion.
 */
@ApiTags('Identities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'identities/email',
  version: ['1'],
})
export class EmailIdentitiesController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {
    super(logger);
  }

  /**
   * Dispatches a 6-digit verification code to the specified email address.
   *
   * Rate limited with strict throttle. Validates that the email is not already claimed
   * or verified before generating the OTP.
   *
   * @param userId - ID of the authenticated user requesting verification.
   * @param dto - Container for the email address to verify.
   * @returns Expiration and resend cooldown durations.
   */
  @Post('send-otp')
  @Throttle(AUTH_STRICT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP for email verification' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verification code sent to email',
    type: SendEmailOtpResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many OTP requests; rate limit cooldown active',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email is already linked or claimed by another account',
  })
  @SerializeExpose(SendEmailOtpResponseDto)
  async sendEmailOtp(
    @CurrentUserId() userId: string,
    @Body() dto: SendEmailOtpRequestDto,
  ): Promise<SendEmailOtpResponseDto> {
    return this.emailVerificationService.sendEmailOtp(userId, dto);
  }

  /**
   * Verifies the 6-digit OTP code and links the email as a verified identity to the user account.
   *
   * Atomically consumes the OTP, creates or claims the identity record with isVerified: true,
   * retroactively resolves any pending likes targeting this email, and dispatches security alerts.
   *
   * @param userId - ID of the authenticated user verifying the code.
   * @param dto - Container for the email address and 6-digit OTP code.
   * @returns Masked representation of the newly linked identity.
   */
  @Post('verify-otp')
  @Throttle(AUTH_STRICT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email OTP and link identity' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email verified and linked successfully',
    type: IdentityResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired verification code',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded',
  })
  @SerializeExpose(IdentityResponseDto)
  async verifyEmailOtp(
    @CurrentUserId() userId: string,
    @Body() dto: VerifyEmailOtpRequestDto,
  ) {
    return this.emailVerificationService.verifyEmailOtp(userId, dto);
  }
}
