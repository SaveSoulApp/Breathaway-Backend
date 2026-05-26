import { ApiProperty } from '@nestjs/swagger';
import { IdentityType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class LookupIdentityRequestDto {
  @ApiProperty({ enum: IdentityType, description: 'Type of the identity' })
  @IsEnum(IdentityType)
  type: IdentityType;

  @ApiProperty({
    description:
      'The raw public value to look up (e.g., phone number, email, social handle)',
  })
  @IsString()
  @IsNotEmpty()
  publicValue: string;
}
