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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  ClientIp,
  CurrentUserId,
  OptionalCurrentUserId,
} from '@common/decorators';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { ActiveSubscriptionNotFoundException } from './application/exceptions';
import {
  ListPlansQueryDto,
  SubscriptionHistoryQueryDto,
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
   * Lists all active subscription plans, localized by geography.
   *
   * Available publicly. Region is resolved authoritatively from:
   * 1. Authenticated user profile country code (if logged in and country is set).
   * 2. Public client IP address via IPinfo Lite (if unauthenticated or user country is null).
   * 3. System default fallback ('IN').
   * An explicit query param `countryCode` may also be supplied (e.g. from currency switcher).
   *
   * @param query - Optional query parameters containing ISO 3166-1 alpha-2 country code.
   * @param userId - Optional authenticated user ID resolved from Bearer token.
   * @param clientIp - Client public IP address extracted from GCP proxy headers.
   * @returns An array of active plans and their regional prices for the resolved country.
   */
  @Get('plans')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all active subscription plans with localized prices',
    description:
      'Available publicly. Region is resolved authoritatively from: ' +
      '1) authenticated user profile (via optional Bearer token), ' +
      '2) client IP via IPinfo Lite, or 3) server default ("IN").',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [SubscriptionPlanResponseDto],
  })
  @SerializeExpose(SubscriptionPlanResponseDto)
  async listPlans(
    @Query() query: ListPlansQueryDto,
    @OptionalCurrentUserId() userId: string | null,
    @ClientIp() clientIp: string | undefined,
  ) {
    return this.subscriptionPlansService.listActivePlans(
      userId,
      clientIp,
      query.countryCode,
    );
  }

  /**
   * Retrieves a single subscription plan by its unique identifier.
   *
   * Useful for fetching detailed plan information before presenting
   * purchase options to the user.
   *
   * @param id - UUID of the subscription plan.
   * @returns The requested subscription plan.
   * @throws {SubscriptionPlanNotFoundException} When no plan exists with the given id.
   */
  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a single subscription plan by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SubscriptionPlanResponseDto,
  })
  @SerializeExpose(SubscriptionPlanResponseDto)
  async getPlan(@Param('id') id: string) {
    return this.subscriptionPlansService.getPlanById(id);
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
   * @throws {InvalidSubscriptionDatesException} When expiration date precedes purchase date.
   * @throws {SubscriptionPlanNotFoundException} When the corresponding plan is not found.
   */
  @Post('verify-purchase')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
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
  @SerializeExpose(UserSubscriptionResponseDto)
  async verifyPurchase(
    @CurrentUserId() userId: string,
    @Body() dto: VerifyPurchaseRequestDto,
  ) {
    return this.subscriptionsService.verifyAndCreateSubscription(userId, dto);
  }

  /**
   * Retrieves the authenticated user's currently active or grace-period subscription.
   *
   * @param userId - ID of the authenticated user requesting their active subscription.
   * @returns The active subscription entity, including current plan and prices.
   * @throws {ActiveSubscriptionNotFoundException} When the user does not have an active subscription.
   */
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get current user's active subscription" })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserSubscriptionResponseDto,
  })
  @SerializeExpose(UserSubscriptionResponseDto)
  async getMySubscription(@CurrentUserId() userId: string) {
    const subscription =
      await this.subscriptionsService.getActiveSubscription(userId);

    if (!subscription) {
      throw new ActiveSubscriptionNotFoundException();
    }

    return subscription;
  }

  /**
   * Retrieves the historical list of all subscriptions for the authenticated user.
   *
   * Useful for billing history screens or when checking past cancelled subscriptions.
   *
   * @param userId - ID of the authenticated user.
   * @param query  - Optional pagination parameters (`page`, `limit`).
   * @returns Paginated array of past and present subscriptions, ordered newest first.
   */
  @Get('me/history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get user's subscription history" })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page, max 50 (default: 20)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [UserSubscriptionResponseDto],
  })
  @SerializeExpose(UserSubscriptionResponseDto)
  async getMySubscriptionHistory(
    @CurrentUserId() userId: string,
    @Query() query: SubscriptionHistoryQueryDto,
  ) {
    return this.subscriptionsService.getSubscriptionHistory(
      userId,
      query.page,
      query.limit,
    );
  }
}
