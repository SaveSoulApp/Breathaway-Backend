import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType, IntentType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TargetIdentityInputDto {
  @ApiProperty({
    enum: IdentityType,
    description: 'Type of identity to resolve or create',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IdentityType)
  @IsNotEmpty()
  type: IdentityType;

  @ApiProperty({
    description: 'The raw public value (e.g. phone number, IG handle)',
  })
  @IsString()
  @IsNotEmpty()
  publicValue: string;

  @ApiPropertyOptional({ description: 'Constant numeric platform ID' })
  @IsString()
  @IsOptional()
  platformId?: string;
}

/* istanbul ignore next */
/* istanbul ignore next */
export class CreateLikeRequestDto {
  @ApiPropertyOptional({
    description: 'Existing Identity ID, if already known',
  })
  @IsOptional()
  @IsString()
  targetIdentityId?: string;

  @ApiPropertyOptional({
    type: TargetIdentityInputDto,
    description:
      'Raw identity input to resolve or create if targetIdentityId is not provided',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TargetIdentityInputDto)
  targetIdentity?: TargetIdentityInputDto;

  @ApiProperty({ enum: IntentType })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IntentType)
  @IsNotEmpty()
  intent: IntentType;
}
