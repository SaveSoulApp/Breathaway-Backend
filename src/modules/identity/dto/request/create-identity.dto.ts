import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIdentityDto {
  @ApiProperty({ enum: IdentityType, description: 'Type of the identity' })
  @IsEnum(IdentityType)
  type: IdentityType;

  @ApiProperty({ description: 'Public value (e.g., phone number, email, social handle)' })
  @IsString()
  @IsNotEmpty()
  publicValue: string;

  @ApiPropertyOptional({ description: 'Constant numeric platform ID (e.g., Instagram numerical ID)' })
  @IsString()
  @IsOptional()
  platformId?: string;
}