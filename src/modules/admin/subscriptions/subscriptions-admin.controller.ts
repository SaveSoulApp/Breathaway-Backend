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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '@modules/admin/guards/admin-oidc-auth.guard';
import {
  CreatePlanPriceRequestDto,
  CreatePlanRequestDto,
  QueryPriceHistoryRequestDto,
  SubscriptionPlanPriceHistoryResponseDto,
  SubscriptionPlanPriceResponseDto,
  SubscriptionPlanResponseDto,
  UpdatePlanPriceRequestDto,
  UpdatePlanRequestDto,
} from '@modules/subscriptions/dto';
import { SubscriptionPlansService } from '@modules/subscriptions/services/subscription-plans.service';

/**
 * Handles HTTP operations for the /admin/subscriptions resource.
 *
 * Exposes administrative endpoints to manage subscription plans, localized pricing,
 * promotional discount windows, and temporal price audit history.
 * Requires Google OIDC Bearer Auth with GCP IAM administrative authorization.
 */
@ApiTags('Admin - Subscriptions')
@SkipClientIdentity()
@ApiBearerAuth('gcp-oidc')
@UseGuards(AdminOidcAuthGuard)
@Controller({
  path: 'admin/subscriptions',
  version: ['1'],
})
export class SubscriptionsAdminController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {
    super(logger);
  }

  /**
   * Creates a new subscription plan.
   *
   * @param dto - Details of the new plan (name, credits granted, validity days, etc).
   * @returns The newly created subscription plan.
   */
  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new subscription plan' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: SubscriptionPlanResponseDto,
  })
  @SerializeExpose(SubscriptionPlanResponseDto)
  async createPlan(@Body() dto: CreatePlanRequestDto) {
    return this.subscriptionPlansService.createPlan(dto);
  }

  /**
   * Retrieves all subscription plans in the system, both active and inactive.
   *
   * @returns An array of all subscription plans.
   */
  @Get('plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get list of all available subscription plans' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [SubscriptionPlanResponseDto],
  })
  @SerializeExpose(SubscriptionPlanResponseDto)
  async listPlans() {
    return this.subscriptionPlansService.listAllPlans();
  }

  /**
   * Updates properties of an existing subscription plan.
   *
   * @param id - UUID of the subscription plan to update.
   * @param dto - Fields to update.
   * @returns The updated subscription plan.
   */
  @Patch('plans/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an existing subscription plan' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SubscriptionPlanResponseDto,
  })
  @SerializeExpose(SubscriptionPlanResponseDto)
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanRequestDto) {
    return this.subscriptionPlansService.updatePlan(id, dto);
  }

  /**
   * Adds a localized price entry to an existing subscription plan.
   *
   * @param planId - UUID of the subscription plan.
   * @param dto - Currency, country code, originalPrice, optional promotional discount, and audit reason.
   * @returns The newly created price entry.
   */
  @Post('plans/:planId/prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a price entry to a subscription plan' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: SubscriptionPlanPriceResponseDto,
  })
  @SerializeExpose(SubscriptionPlanPriceResponseDto)
  async addPlanPrice(
    @Param('planId') planId: string,
    @Body() dto: CreatePlanPriceRequestDto,
    @Req() req?: Request & { adminUser?: { email: string } },
  ) {
    const adminUser = req?.adminUser?.email;
    return adminUser
      ? this.subscriptionPlansService.addPlanPrice(planId, dto, adminUser)
      : this.subscriptionPlansService.addPlanPrice(planId, dto);
  }

  /**
   * Updates an existing price entry, such as a base price increase/decrease or
   * scheduling/clearing a promotional discount window.
   *
   * @param planId - UUID of the subscription plan.
   * @param priceId - UUID of the price entry to modify.
   * @param dto - Price changes, promotional parameters, and audit reason.
   * @returns The updated price entry with resolved effective pricing.
   */
  @Patch('plans/:planId/prices/:priceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a price entry, base price hike, or promotional discount',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SubscriptionPlanPriceResponseDto,
  })
  @SerializeExpose(SubscriptionPlanPriceResponseDto)
  async updatePlanPrice(
    @Param('planId') planId: string,
    @Param('priceId') priceId: string,
    @Body() dto: UpdatePlanPriceRequestDto,
    @Req() req?: Request & { adminUser?: { email: string } },
  ) {
    const adminUser = req?.adminUser?.email;
    return adminUser
      ? this.subscriptionPlansService.updatePlanPrice(
          planId,
          priceId,
          dto,
          adminUser,
        )
      : this.subscriptionPlansService.updatePlanPrice(planId, priceId, dto);
  }

  /**
   * Removes a localized price entry from a subscription plan and closes its active audit interval.
   *
   * @param planId - UUID of the subscription plan.
   * @param priceId - UUID of the price entry to remove.
   */
  @Delete('plans/:planId/prices/:priceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a price entry from a subscription plan' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async removePlanPrice(
    @Param('planId') planId: string,
    @Param('priceId') priceId: string,
    @Req() req?: Request & { adminUser?: { email: string } },
  ): Promise<void> {
    const adminUser = req?.adminUser?.email;
    if (adminUser) {
      await this.subscriptionPlansService.removePlanPrice(
        planId,
        priceId,
        adminUser,
      );
    } else {
      await this.subscriptionPlansService.removePlanPrice(planId, priceId);
    }
  }

  /**
   * Queries the temporal price audit history for a plan across any date range or at a specific point in time.
   *
   * @param planId - UUID of the subscription plan.
   * @param query - Date range (startDate, endDate) or pointInTime filter.
   * @returns Chronological list of price configurations and audit records.
   */
  @Get('plans/:planId/prices/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Query price audit history across date ranges or at a point in time',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [SubscriptionPlanPriceHistoryResponseDto],
  })
  @SerializeExpose(SubscriptionPlanPriceHistoryResponseDto)
  async getPriceHistory(
    @Param('planId') planId: string,
    @Query() query: QueryPriceHistoryRequestDto,
  ) {
    return this.subscriptionPlansService.getPriceHistory(planId, query);
  }
}
