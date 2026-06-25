import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType, IntentType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TargetIdentityInputDto {
  @ApiProperty({
    enum: IdentityType,
    description: 'Type of identity to resolve or create',
  })
  @Transform(({ value }: { value: unknown }) =>
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  publicValue: string;

  @ApiPropertyOptional({ description: 'Constant numeric platform ID' })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  platformId?: string;
}

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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IntentType)
  @IsNotEmpty()
  intent: IntentType;

  @ApiPropertyOptional({
    description:
      "A personal label to remember who this like is for (e.g. 'Sarah', 'My Crush')",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
