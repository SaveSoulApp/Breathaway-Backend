import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SubscriptionPlanStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { CreatePlanRequestDto } from './create-plan.request.dto';

export class UpdatePlanRequestDto extends PartialType(CreatePlanRequestDto) {
  @ApiPropertyOptional({
    enum: SubscriptionPlanStatus,
    description: 'Status of the subscription plan',
  })
  @IsEnum(SubscriptionPlanStatus)
  @IsOptional()
  status?: SubscriptionPlanStatus;
}
