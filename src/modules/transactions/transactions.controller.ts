import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminBasicAuthGuard } from '@modules/admin/guards/admin-basic-auth.guard';
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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  PaginatedTransactionResponseDto,
  TransactionQueryRequestDto,
  TransactionResponseDto,
} from './dto';
import { TransactionsService } from './transactions.service';

/**
 * Administrative read surface for the /transactions domain.
 *
 * Transactions are written exclusively by gateway webhook handlers, never by a
 * client, so this controller is read-only. The listing is not scoped to a user —
 * it spans every account — which is why it sits behind Basic Auth alongside the
 * other admin controllers rather than the JWT guard.
 */
@ApiTags('Admin - Transactions')
@SkipClientIdentity()
@ApiBearerAuth()
@UseGuards(AdminBasicAuthGuard)
@Controller({
  path: 'admin/transactions',
  version: ['1'],
})
export class TransactionsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly transactionsService: TransactionsService,
  ) {
    super(logger);
  }

  /**
   * Returns a paginated, filtered list of gateway transactions across all users.
   *
   * @param query - Pagination, sorting, and filter options.
   * @returns A paginated list of transactions.
   */
  @Get()
  @ApiOperation({ summary: 'List gateway transactions' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaginatedTransactionResponseDto,
  })
  async findAll(
    @Query() query: TransactionQueryRequestDto,
  ): Promise<PaginatedTransactionResponseDto> {
    return this.transactionsService.findAll(query);
  }

  /**
   * Retrieves a single transaction by ID.
   *
   * @param id - ULID of the transaction.
   * @returns The matching transaction.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single transaction' })
  @ApiResponse({ status: HttpStatus.OK, type: TransactionResponseDto })
  async findOne(@Param('id') id: string): Promise<TransactionResponseDto> {
    return this.transactionsService.findOne(id);
  }
}
