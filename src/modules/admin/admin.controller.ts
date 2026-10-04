import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
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

import {
  ApiStandardErrors,
  ClientIp,
  DeviceId,
  UserAgent,
} from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { RequireTimezoneGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AuthService } from '@modules/auth/auth.service';
import { AUTH_DEV_LOGIN_THROTTLE } from '@modules/auth/constants';
import { DevLoginRequestDto, UserAuthResponseDto } from '@modules/auth/dto';
import { CreditsService } from '@modules/credits/credits.service';
import {
  ConsumeCreditsRequestDto,
  CreditLedgerResponseDto,
  GrantCreditsRequestDto,
} from '@modules/credits/dto';

import { AdminService } from './admin.service';
import { DeleteAccountRequestDto } from './dto';
import { AdminOidcAuthGuard } from './guards/admin-oidc-auth.guard';

@ApiTags('Admin')
@SkipClientIdentity()
@ApiStandardErrors()
@Controller({
  path: 'admin',
  version: ['1'],
})
@UseGuards(AdminOidcAuthGuard)
@ApiBearerAuth('gcp-oidc')
export class AdminController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly adminService: AdminService,
    private readonly creditsService: CreditsService,
    private readonly authService: AuthService,
  ) {
    super(logger);
  }

  @Delete('users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a user account',
    description: 'Soft deletes a user account and their associated data.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Account successfully soft-deleted.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found or already deleted.',
  })
  async deleteAccount(
    @Param('userId') userId: string,
    @Body() dto: DeleteAccountRequestDto,
  ): Promise<void> {
    await this.adminService.deleteAccount(userId, dto.reason);
  }

  /**
   * Grants credits to a user account. Callable only with valid admin Basic Auth
   * credentials — no user JWT is accepted on this route.
   *
   * @param dto - Grant payload: target `userId`, `amount`, `source`, and optional `referenceId` / `expiresAt`.
   * @returns The newly created ledger entry recording the credit grant.
   * @throws {BadRequestException} When the `LIKE_USAGE` credit source is supplied.
   */
  @Post('credits/grant')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Grant credits to a user (Admin)',
    description:
      'Awards credits to a specified user. Requires HTTP Basic Auth with admin credentials. Not accessible via user JWTs.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Credits successfully granted; ledger entry returned.',
    type: CreditLedgerResponseDto,
  })
  @UseGuards(RequireTimezoneGuard)
  @SerializeExpose(CreditLedgerResponseDto)
  async grantCredits(
    @Body() dto: GrantCreditsRequestDto,
  ): Promise<CreditLedgerResponseDto> {
    // req.timezone is attached by TimezoneMiddleware, defaulting to UTC if invalid
    // Since we enforce x-timezone header, req.timezone will be the normalized IANA timezone
    return this.creditsService.grantCredits(dto, undefined);
  }

  /**
   * Consumes (deducts) credits from a user's account. Callable only with valid admin
   * Basic Auth credentials — no user JWT is accepted on this route.
   *
   * @param dto - Consume payload: target `userId`, `amount`, and `referenceId`.
   * @returns The newly created ledger entry recording the debit transaction.
   * @throws {BadRequestException} When the user's current balance is insufficient to cover the requested amount.
   * @throws {UserNotFoundException} When the target user does not exist.
   */
  @Post('credits/consume')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Consume credits from a user (Admin)',
    description:
      'Deducts credits from a specified user. Requires HTTP Basic Auth with admin credentials. Not accessible via user JWTs.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Credits successfully consumed; debit ledger entry returned.',
    type: CreditLedgerResponseDto,
  })
  @SerializeExpose(CreditLedgerResponseDto)
  async consumeCredits(
    @Body() dto: ConsumeCreditsRequestDto,
  ): Promise<CreditLedgerResponseDto> {
    return this.creditsService.consumeCredits(dto);
  }

  /**
   * Bypasses standard external OAuth or OTP checks to authenticate a developer during testing.
   *
   * Callable only by authorized GCP administrators via Google Cloud ID tokens.
   *
   * @param dto - The developer user's identifier (email or phone).
   * @param clientIp - Optional client IP address from request headers.
   * @param userAgent - Optional client user-agent string.
   * @param deviceId - Optional unique device identifier.
   * @returns The authenticated user details and JWT access and refresh tokens.
   * @throws {NotFoundException} When no user exists with the provided developer credential.
   */
  @Post('dev-login')
  @Throttle(AUTH_DEV_LOGIN_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Developer login for testing purposes (Admin)',
    description:
      'Bypasses OAuth/OTP checks to authenticate a developer during testing. Requires GCP OIDC ID token with admin permissions.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dev user successfully authenticated',
    type: UserAuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many dev-login attempts; rate limit exceeded',
  })
  @SerializeExpose(UserAuthResponseDto)
  devLogin(
    @Body() dto: DevLoginRequestDto,
    @ClientIp() clientIp?: string,
    @UserAgent() userAgent?: string,
    @DeviceId() deviceId?: string,
  ) {
    return this.authService.devLogin(dto, {
      ipAddress: clientIp,
      userAgent,
      deviceId,
    });
  }
}
