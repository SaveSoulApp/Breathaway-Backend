import { ApiProperty } from '@nestjs/swagger';
import { CreditSource } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class GrantCreditsRequestDto {
  @ApiProperty({ description: 'The ULID of the user receiving the credits' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Amount of credits to grant (must be positive)' })
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: CreditSource, description: 'Source of the credits' })
  @IsEnum(CreditSource)
  source: CreditSource;

  @ApiProperty({
    required: false,
    description: 'Optional reference ID (e.g. campaign ID)',
  })
  @IsString()
  @IsOptional()
  referenceId?: string;

  @ApiProperty({
    required: false,
    description: 'Optional expiration date in ISO format',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
