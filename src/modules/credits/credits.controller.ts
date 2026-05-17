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
  Options,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedCreditLedgerResponseDto })
  async getLedger(
    @CurrentUserId() userId: string,
    @Query() query: CreditLedgerQueryDto,
  ): Promise<PaginatedCreditLedgerResponseDto> {
    return this.creditsService.getLedger(userId, query);
  }

  @Options('ledger')
  @ApiOperation({ summary: 'Get ledger options and query parameters' })
  getLedgerOptions(@Res() res: Response) {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    // We could parse class-validator decorators dynamically,
    // but here we simply return a well-structured JSON representing the available parameters
    res.status(HttpStatus.OK).json({
      methods: ['GET', 'OPTIONS'],
      queryParams: {
        page: { type: 'number', default: 1, minimum: 1 },
        limit: { type: 'number', default: 20, minimum: 1, maximum: 100 },
        sortBy: { type: 'string', enum: ['createdAt'], default: 'createdAt' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        transactionType: { type: 'string', enum: ['CREDIT', 'DEBIT'] },
        creditStatus: { type: 'string', enum: ['ACTIVE', 'EXPIRED'] },
        source: {
          type: 'array',
          items: { type: 'string', enum: ['PURCHASE', 'BONUS', 'REFERRAL', 'LIKE_USAGE', 'ADMIN'] }
        },
        createdFrom: { type: 'string', format: 'date-time' },
        createdTo: { type: 'string', format: 'date-time' },
        expiresWithinDays: { type: 'number', minimum: 1 },
        search: { type: 'string', description: 'Partial match on referenceId' }
      }
    });
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
