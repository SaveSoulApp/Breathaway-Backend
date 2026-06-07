import { CurrentUserId } from '@common/decorators';
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
  CreditLedgerQueryDto,
  CreditLedgerResponseDto,
  GrantCreditsRequestDto,
  PaginatedCreditLedgerResponseDto,
} from './dto';

@ApiTags('Credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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

  @Get('balance')
  @ApiOperation({ summary: 'Get current credit balance' })
  @ApiResponse({ status: HttpStatus.OK, type: CreditBalanceResponseDto })
  async getBalance(
    @CurrentUserId() userId: string,
  ): Promise<CreditBalanceResponseDto> {
    const balance = await this.creditsService.getBalance(userId);
    return { balance };
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Get credit ledger history' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaginatedCreditLedgerResponseDto,
  })
  async getLedger(
    @CurrentUserId() userId: string,
    @Query() query: CreditLedgerQueryDto,
  ): Promise<PaginatedCreditLedgerResponseDto> {
    return this.creditsService.getLedger(userId, query);
  }

  @Get('ledger/:id')
  @ApiOperation({ summary: 'Get single ledger entry' })
  @ApiResponse({ status: HttpStatus.OK, type: CreditLedgerResponseDto })
  async getLedgerEntry(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<CreditLedgerResponseDto> {
    return this.creditsService.getLedgerEntry(userId, id);
  }

  @Post('internal/grant')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Grant credits (Internal/Admin)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CreditLedgerResponseDto })
  async grantCredits(
    @Body() dto: GrantCreditsRequestDto,
  ): Promise<CreditLedgerResponseDto> {
    return this.creditsService.grantCredits(dto);
  }

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
