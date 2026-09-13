import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { CreditsService } from './credits.service';
import {
  CreditBalanceResponseDto,
  CreditLedgerQueryRequestDto,
  CreditLedgerResponseDto,
  ExpiringCreditItemDto,
  ExpiringCreditsResponseDto,
  PaginatedCreditLedgerResponseDto,
} from './dto';

/**
 * HTTP resource for the /credits domain; all endpoints require a valid JWT.
 * Credit grants and debits/consumption are handled exclusively by the Admin
 * controller (`POST /admin/credits/grant`, `POST /admin/credits/consume`) which
 * is protected by Basic Auth.
 */
@ApiTags('Credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@ApiExtraModels(ExpiringCreditItemDto)
@Controller({
  path: 'credits',
  version: ['1'],
})
export class CreditsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly creditsService: CreditsService,
  ) {
    super(logger);
  }

  /**
   * Returns the caller's current net spendable credit balance.
   *
   * @returns The aggregated balance available for consumption.
   */
  @Get('balance')
  @ApiOperation({ summary: 'Get current credit balance' })
  @ApiResponse({ status: HttpStatus.OK, type: CreditBalanceResponseDto })
  async getBalance(
    @CurrentUserId() userId: string,
  ): Promise<CreditBalanceResponseDto> {
    const balance = await this.creditsService.getBalance(userId);
    return { balance };
  }

  /**
   * Returns a list of active credit bundles for the caller, including the
   * unconsumed remaining balance and expiry date for each bundle.
   *
   * @returns An array of active credit bundles and their remaining balances.
   */
  @Get('expiring')
  @ApiOperation({ summary: 'Get expiring credits breakdown' })
  @ApiResponse({ status: HttpStatus.OK, type: ExpiringCreditsResponseDto })
  async getExpiringCredits(
    @CurrentUserId() userId: string,
  ): Promise<ExpiringCreditsResponseDto> {
    const expiringCredits =
      await this.creditsService.getExpiringCredits(userId);
    return { data: expiringCredits };
  }

  /**
   * Returns paginated, filtered transaction history scoped to the authenticated caller.
   *
   * @param query - Pagination and filter options (page, limit, source, date range).
   * @returns A paginated list of ledger entries belonging to the caller.
   */
  @Get('ledger')
  @ApiOperation({ summary: 'Get credit ledger history' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaginatedCreditLedgerResponseDto,
  })
  async getLedger(
    @CurrentUserId() userId: string,
    @Query() query: CreditLedgerQueryRequestDto,
  ): Promise<PaginatedCreditLedgerResponseDto> {
    return this.creditsService.getLedger(userId, query);
  }

  /**
   * Retrieves a single ledger entry by ID, strictly scoped to the caller to
   * prevent cross-user data access.
   *
   * @param id - The UUID of the ledger entry to fetch.
   * @returns The matching ledger entry.
   * @throws `NotFoundException` when the entry does not exist or belongs to a different user.
   */
  @Get('ledger/:id')
  @ApiOperation({ summary: 'Get single ledger entry' })
  @ApiResponse({ status: HttpStatus.OK, type: CreditLedgerResponseDto })
  async getLedgerEntry(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<CreditLedgerResponseDto> {
    return this.creditsService.getLedgerEntry(userId, id);
  }
}
