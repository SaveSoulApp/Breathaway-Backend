import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import {
  ConsumeCreditsRequestDto,
  CreditBalanceResponseDto,
  CreditLedgerQueryRequestDto,
  CreditLedgerResponseDto,
  PaginatedCreditLedgerResponseDto,
} from './dto';

/**
 * HTTP resource for the /credits domain; all endpoints require a valid JWT.
 * The `internal/consume` route is intended exclusively for server-to-server
 * calls (e.g., scheduler, internal services) and must not be exposed through
 * the public API gateway. Credit grants are handled exclusively by the Admin
 * controller (`POST /admin/credits/grant`) which is protected by Basic Auth.
 */
@ApiTags('Credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
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

  /**
   * Internal endpoint that deducts credits from a user's balance and records
   * the debit ledger entry.
   *
   * @param dto - Consume payload including target userId, amount, and source.
   * @returns The newly created ledger entry for the debit transaction.
   * @throws `BadRequestException` when the user's current balance is insufficient to cover the requested amount.
   */
  @Post('internal/consume')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Consume credits (Internal)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CreditLedgerResponseDto })
  async consumeCredits(
    @Body() dto: ConsumeCreditsRequestDto,
  ): Promise<CreditLedgerResponseDto> {
    return this.creditsService.consumeCredits(dto);
  }
}
