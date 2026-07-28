import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { CreditsService } from '@modules/credits/credits.service';
import {
  CreditLedgerResponseDto,
  GrantCreditsRequestDto,
} from '@modules/credits/dto';
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequireTimezoneGuard } from '@common/guards';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { DeleteAccountRequestDto } from './dto';
import { AdminBasicAuthGuard } from './guards/admin-basic-auth.guard';

@ApiTags('Admin')
@SkipClientIdentity()
@ApiStandardErrors()
@Controller({
  path: 'admin',
  version: ['1'],
})
@UseGuards(AdminBasicAuthGuard)
@ApiBasicAuth()
export class AdminController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly adminService: AdminService,
    private readonly creditsService: CreditsService,
  ) {
    super(logger);
  }

  @Delete('users/:userId')
  @ApiOperation({
    summary: 'Delete a user account',
    description: 'Soft deletes a user account and their associated data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Account successfully soft-deleted.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found or already deleted.',
  })
  async deleteAccount(
    @Param('userId') userId: string,
    @Body() dto: DeleteAccountRequestDto,
  ): Promise<void> {
    return this.adminService.deleteAccount(userId, dto.reason);
  }

  /**
   * Grants credits to a user account. Callable only with valid admin Basic Auth
   * credentials — no user JWT is accepted on this route.
   *
   * @param dto - Grant payload: target `userId`, `amount`, `source`, and optional `referenceId` / `expiresAt`.
   * @returns The newly created ledger entry recording the credit grant.
   * @throws `BadRequestException` when the `LIKE_USAGE` credit source is supplied.
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
  async grantCredits(
    @Req() req: Request,
    @Body() dto: GrantCreditsRequestDto,
  ): Promise<CreditLedgerResponseDto> {
    // req.timezone is attached by TimezoneMiddleware, defaulting to UTC if invalid
    // Since we enforce x-timezone header, req.timezone will be the normalized IANA timezone
    const timezone = (req as any).timezone;
    return this.creditsService.grantCredits(dto, undefined, timezone);
  }
}
