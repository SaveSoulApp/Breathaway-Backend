import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminBasicAuthGuard } from '@modules/admin/guards/admin-basic-auth.guard';
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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreatePlanPriceRequestDto,
  CreatePlanRequestDto,
  SubscriptionPlanPriceResponseDto,
  SubscriptionPlanResponseDto,
  UpdatePlanRequestDto,
} from './dto';
import { SubscriptionPlansService } from './services/subscription-plans.service';

/**
 * Handles HTTP operations for the /admin/subscriptions resource.
 *
 * Exposes administrative endpoints to manage subscription plans and their localized pricing.
 * Requires Basic Auth.
 */
@ApiTags('Admin - Subscriptions')
@SkipClientIdentity()
@ApiBearerAuth()
@UseGuards(AdminBasicAuthGuard)
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
  async createPlan(
    @Body() dto: CreatePlanRequestDto,
  ): Promise<SubscriptionPlanResponseDto> {
    return (await this.subscriptionPlansService.createPlan(
      dto,
    )) as unknown as SubscriptionPlanResponseDto;
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
  async listPlans(): Promise<SubscriptionPlanResponseDto[]> {
    return (await this.subscriptionPlansService.listAllPlans()) as unknown as SubscriptionPlanResponseDto[];
  }

  /**
   * Updates properties of an existing subscription plan.
   *
   * Does not affect active user subscriptions already on this plan, except for UI presentation.
   *
   * @param id - UUID of the subscription plan to update.
   * @param dto - Fields to update.
   * @returns The updated subscription plan.
   * @throws {NotFoundException} When no plan exists with the given id.
   */
  @Patch('plans/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an existing subscription plan' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SubscriptionPlanResponseDto,
  })
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanRequestDto,
  ): Promise<SubscriptionPlanResponseDto> {
    return (await this.subscriptionPlansService.updatePlan(
      id,
      dto,
    )) as unknown as SubscriptionPlanResponseDto;
  }

  /**
   * Adds a localized price entry to an existing subscription plan.
   *
   * @param planId - UUID of the subscription plan.
   * @param dto - Currency, country code, and price amount.
   * @returns The newly created price entry.
   * @throws {NotFoundException} When the subscription plan does not exist.
   */
  @Post('plans/:planId/prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a price entry to a subscription plan' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: SubscriptionPlanPriceResponseDto,
  })
  async addPlanPrice(
    @Param('planId') planId: string,
    @Body() dto: CreatePlanPriceRequestDto,
  ): Promise<SubscriptionPlanPriceResponseDto> {
    return (await this.subscriptionPlansService.addPlanPrice(
      planId,
      dto,
    )) as unknown as SubscriptionPlanPriceResponseDto;
  }

  /**
   * Removes a localized price entry from a subscription plan.
   *
   * @param planId - UUID of the subscription plan.
   * @param priceId - UUID of the price entry to remove.
   * @throws {NotFoundException} When the plan or price entry does not exist.
   */
  @Delete('plans/:planId/prices/:priceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a price entry from a subscription plan' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async removePlanPrice(
    @Param('planId') planId: string,
    @Param('priceId') priceId: string,
  ): Promise<void> {
    await this.subscriptionPlansService.removePlanPrice(planId, priceId);
  }
}
