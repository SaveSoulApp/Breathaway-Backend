import { IdentityType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateIdentityDto {
  @IsEnum(IdentityType)
  type: IdentityType;

  @IsString()
  @IsNotEmpty()
  publicValue: string;
}