import { IdentityType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIdentityDto {
  @IsEnum(IdentityType)
  type: IdentityType;

  @IsString()
  @IsNotEmpty()
  publicValue: string;

  @IsString()
  @IsOptional()
  platformId?: string;
}