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
import {
  SubscriptionPlanResponseDto,
  UserSubscriptionResponseDto,
  VerifyPurchaseRequestDto,
} from './dto';
import { SubscriptionPlansService } from './services/subscription-plans.service';
import { SubscriptionsService } from './services/subscriptions.service';

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
    return this.subscriptionPlansService.listActivePlans(countryCode) as any;
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a single subscription plan by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SubscriptionPlanResponseDto,
  })
  async getPlan(
    @Param('id') id: string,
  ): Promise<SubscriptionPlanResponseDto> {
    return this.subscriptionPlansService.getPlanById(id) as any;
  }

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
    return this.subscriptionsService.verifyAndCreateSubscription(
      userId,
      dto,
    ) as any;
  }

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

    return subscription as any;
  }

  @Get('me/history')
  @ApiOperation({ summary: "Get user's subscription history" })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [UserSubscriptionResponseDto],
  })
  async getMySubscriptionHistory(
    @CurrentUserId() userId: string,
  ): Promise<UserSubscriptionResponseDto[]> {
    return this.subscriptionsService.getSubscriptionHistory(userId) as any;
  }
}
