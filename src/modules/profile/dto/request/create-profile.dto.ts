import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GenderType } from '@prisma/client';
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({
    description: 'First name of the user',
    example: 'John',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiPropertyOptional({
    description: 'Last name of the user',
    example: 'Doe',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Date of birth',
    example: '1990-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    description: 'Gender of the user',
    enum: GenderType,
    example: GenderType.MALE,
  })
  @IsOptional()
  @IsEnum(GenderType)
  gender?: GenderType;
}