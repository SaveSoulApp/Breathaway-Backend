import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '@modules/admin/guards/admin-oidc-auth.guard';

import {
  CreatePaymentRouteRequestDto,
  ListPaymentRoutesQueryDto,
  PaymentRouteResponseDto,
  ReorderPaymentRoutesRequestDto,
  UpdatePaymentRouteRequestDto,
} from './dto';
import { PaymentRoutesService } from './payment-routes.service';

/**
 * Administrative controller for managing payment gateway routing, dynamic kill-switches,
 * amount boundaries, and priority steps.
 *
 * Protected with Google OIDC Bearer Auth (`AdminOidcAuthGuard`). Callable by:
 * 1. Human administrators via the Admin dashboard or Swagger UI (`/api/admin`).
 * 2. Automated internal systems with authorized Google OIDC credentials.
 */
@ApiTags('Admin - Payments')
@SkipClientIdentity()
@ApiBearerAuth('gcp-oidc')
@UseGuards(AdminOidcAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'admin/payments/routes',
  version: ['1'],
})
export class PaymentRoutesAdminController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly paymentRoutesService: PaymentRoutesService,
  ) {
    super(logger);
  }

  /**
   * Creates a new payment gateway route for a country.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create payment gateway route',
    description:
      'Creates a new payment gateway routing configuration. ' +
      'Priority step defaults to N + 1. If assigned to step K, existing routes shift down.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment gateway route created successfully.',
    type: PaymentRouteResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Route already exists for this country and gateway.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Invalid priority step, invalid amount range, or cannot create only gateway disabled.',
  })
  async createRoute(
    @Body() dto: CreatePaymentRouteRequestDto,
  ): Promise<PaymentRouteResponseDto> {
    return this.paymentRoutesService.createRoute(dto);
  }

  /**
   * Lists all payment gateway routes with optional filtering.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List payment gateway routes',
    description:
      'Returns all payment gateway routes sorted by countryCode ASC, priority ASC. ' +
      'Supports filtering by countryCode, enabled, and gateway provider.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of payment gateway routes.',
    type: [PaymentRouteResponseDto],
  })
  async listRoutes(
    @Query() query: ListPaymentRoutesQueryDto,
  ): Promise<PaymentRouteResponseDto[]> {
    return this.paymentRoutesService.listRoutes(query);
  }

  /**
   * Batch reorders priority steps for a specific country.
   */
  @Put('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reorder priority steps for a country',
    description:
      'Atomically updates priority steps for a country using an ordered array of route IDs. ' +
      'Index 0 becomes Step 1, Index 1 becomes Step 2, etc. ' +
      'Frequently called by autonomous health balancers shifting traffic based on success rates.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Routes reordered successfully.',
    type: [PaymentRouteResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Route IDs payload does not match all routes for the country.',
  })
  async reorderRoutes(
    @Body() dto: ReorderPaymentRoutesRequestDto,
  ): Promise<PaymentRouteResponseDto[]> {
    return this.paymentRoutesService.reorderRoutes(dto);
  }

  /**
   * Retrieves a single payment gateway route by its ULID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get payment gateway route by ID',
    description: 'Retrieves a single payment gateway route by its unique ULID.',
  })
  @ApiParam({
    name: 'id',
    description: 'ULID of the payment gateway route.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment gateway route found.',
    type: PaymentRouteResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment gateway route not found.',
  })
  async getRouteById(
    @Param('id') id: string,
  ): Promise<PaymentRouteResponseDto> {
    return this.paymentRoutesService.getRouteById(id);
  }

  /**
   * Updates an existing payment gateway route.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update payment gateway route',
    description:
      'Updates enabled status, min/max amount boundaries, or priority step. ' +
      'When priority step is changed, adjacent routes for that country are atomically re-ranked.',
  })
  @ApiParam({
    name: 'id',
    description: 'ULID of the payment gateway route.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment gateway route updated successfully.',
    type: PaymentRouteResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment gateway route not found.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Invalid priority step, invalid amount range, or cannot disable the only active gateway for the country.',
  })
  async updateRoute(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentRouteRequestDto,
  ): Promise<PaymentRouteResponseDto> {
    return this.paymentRoutesService.updateRoute(id, dto);
  }

  /**
   * Toggles the enabled state of a payment gateway route (circuit breaker).
   */
  @Patch(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle route enabled status (circuit breaker)',
    description:
      'Quickly flips the enabled status between true and false. ' +
      'Useful for automated monitoring agents to disable failing gateways in real time.',
  })
  @ApiParam({
    name: 'id',
    description: 'ULID of the payment gateway route.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment gateway route enabled status toggled.',
    type: PaymentRouteResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Cannot disable the only active payment gateway for the country.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment gateway route not found.',
  })
  async toggleRoute(@Param('id') id: string): Promise<PaymentRouteResponseDto> {
    return this.paymentRoutesService.toggleRoute(id);
  }

  /**
   * Deletes a payment gateway route.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete payment gateway route',
    description:
      'Deletes a payment gateway route and automatically compacts remaining priority steps. ' +
      'Cannot delete the only gateway configured for the country.',
  })
  @ApiParam({
    name: 'id',
    description: 'ULID of the payment gateway route.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Payment gateway route deleted successfully.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Cannot delete the only payment gateway configured for the country.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment gateway route not found.',
  })
  async deleteRoute(@Param('id') id: string): Promise<void> {
    return this.paymentRoutesService.deleteRoute(id);
  }
}
