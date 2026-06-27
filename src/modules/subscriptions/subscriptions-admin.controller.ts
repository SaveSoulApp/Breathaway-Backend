import {
  Body,
  Controller,
  Delete,
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

import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BasicAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  CreatePlanPriceRequestDto,
  CreatePlanRequestDto,
  SubscriptionPlanPriceResponseDto,
  SubscriptionPlanResponseDto,
  UpdatePlanRequestDto,
} from './dto';
import { SubscriptionPlansService } from './services/subscription-plans.service';

@ApiTags('Admin - Subscriptions')
@SkipClientIdentity()
@ApiBearerAuth()
@UseGuards(BasicAuthGuard)
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
