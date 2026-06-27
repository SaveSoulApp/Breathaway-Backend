import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  SubscriptionPlanResponseDto,
  UserSubscriptionResponseDto,
  VerifyPurchaseRequestDto,
} from './dto';
import { SubscriptionPlansService } from './services/subscription-plans.service';
import { SubscriptionsService } from './services/subscriptions.service';

/**
 * Handles HTTP operations for the /subscriptions resource.
 *
 * Exposes endpoints for users to browse plans, verify in-app purchases,
 * and view their own subscription status and history.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'subscriptions',
  version: ['1'],
})
export class SubscriptionsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {
    super(logger);
  }

  /**
   * Lists all active subscription plans, optionally filtered by geography.
   *
   * Only returns plans in an ACTIVE state. When a countryCode is provided,
   * prices are filtered to only include pricing available for that region.
   *
   * @param countryCode - Optional ISO 3166-1 alpha-2 country code to filter prices (e.g. 'US').
   * @returns An array of active plans and their regional prices.
   */
  @Get('plans')
  @ApiOperation({ summary: 'List all active subscription plans with prices' })
  @ApiQuery({
    name: 'countryCode',
    required: false,
    description: 'Filter prices by ISO 3166-1 alpha-2 country code',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [SubscriptionPlanResponseDto],
  })
  async listPlans(
    @Query('countryCode') countryCode?: string,
  ): Promise<SubscriptionPlanResponseDto[]> {
    return (await this.subscriptionPlansService.listActivePlans(
      countryCode,
    )) as unknown as SubscriptionPlanResponseDto[];
  }

  /**
   * Retrieves a single subscription plan by its unique identifier.
   *
   * Useful for fetching detailed plan information before presenting
   * purchase options to the user.
   *
   * @param id - UUID of the subscription plan.
   * @returns The requested subscription plan.
   * @throws {NotFoundException} When no plan exists with the given id.
   */
  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a single subscription plan by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SubscriptionPlanResponseDto,
  })
  async getPlan(@Param('id') id: string): Promise<SubscriptionPlanResponseDto> {
    return (await this.subscriptionPlansService.getPlanById(
      id,
    )) as unknown as SubscriptionPlanResponseDto;
  }

  /**
   * Validates an in-app purchase and provisions the subscription for the user.
   *
   * Called by the client application after a successful StoreKit2 or Google Play Billing
   * transaction. This endpoint acts as the authoritative source for new subscriptions,
   * bypassing the delay of asynchronous webhooks. It is completely idempotent.
   *
   * @param userId - ID of the authenticated user purchasing the subscription.
   * @param dto - Token and product IDs returned by the mobile storefront SDK.
   * @returns The newly created or existing subscription record.
   * @throws {BadRequestException} When expiration date precedes purchase date.
   * @throws {NotFoundException} When the corresponding plan is not found.
   */
  @Post('verify-purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify an in-app purchase and create/return the user subscription',
    description:
      'Called by the mobile app after a successful StoreKit2 / Google Play Billing purchase. ' +
      'Idempotent — returns the existing subscription if the purchaseToken was already processed.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserSubscriptionResponseDto,
  })
  async verifyPurchase(
    @CurrentUserId() userId: string,
    @Body() dto: VerifyPurchaseRequestDto,
  ): Promise<UserSubscriptionResponseDto> {
    return (await this.subscriptionsService.verifyAndCreateSubscription(
      userId,
      dto,
    )) as unknown as UserSubscriptionResponseDto;
  }

  /**
   * Retrieves the authenticated user's currently active or grace-period subscription.
   *
   * @param userId - ID of the authenticated user requesting their active subscription.
   * @returns The active subscription entity, including current plan and prices.
   * @throws {NotFoundException} When the user does not have an active subscription.
   */
  @Get('me')
  @ApiOperation({ summary: "Get current user's active subscription" })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserSubscriptionResponseDto,
  })
  async getMySubscription(
    @CurrentUserId() userId: string,
  ): Promise<UserSubscriptionResponseDto> {
    const subscription =
      await this.subscriptionsService.getActiveSubscription(userId);

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    return subscription as unknown as UserSubscriptionResponseDto;
  }

  /**
   * Retrieves the historical list of all subscriptions for the authenticated user.
   *
   * Useful for billing history screens or when checking past cancelled subscriptions.
   *
   * @param userId - ID of the authenticated user.
   * @returns Array of past and present subscriptions, ordered newest first.
   */
  @Get('me/history')
  @ApiOperation({ summary: "Get user's subscription history" })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [UserSubscriptionResponseDto],
  })
  async getMySubscriptionHistory(
    @CurrentUserId() userId: string,
  ): Promise<UserSubscriptionResponseDto[]> {
    return (await this.subscriptionsService.getSubscriptionHistory(
      userId,
    )) as unknown as UserSubscriptionResponseDto[];
  }
}
