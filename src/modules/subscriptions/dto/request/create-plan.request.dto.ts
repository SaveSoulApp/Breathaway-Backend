import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreatePlanRequestDto {
  @ApiProperty({ description: 'Display name of the subscription plan' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'URL-friendly slug (lowercase alphanumeric with hyphens)',
    example: 'premium-monthly',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiPropertyOptional({ description: 'Description of the subscription plan' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Apple App Store product identifier',
  })
  @IsString()
  @IsOptional()
  appleProductId?: string;

  @ApiPropertyOptional({
    description: 'Google Play Store product identifier',
  })
  @IsString()
  @IsOptional()
  googleProductId?: string;

  @ApiProperty({ description: 'Number of credits granted on subscription' })
  @IsInt()
  @IsPositive()
  creditsGranted: number;

  @ApiProperty({ description: 'Validity period in days' })
  @IsInt()
  @IsPositive()
  validityDays: number;

  @ApiPropertyOptional({
    description: 'Trial duration in days',
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  trialDurationDays?: number = 0;

  @ApiPropertyOptional({ description: 'Display sort order' })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
