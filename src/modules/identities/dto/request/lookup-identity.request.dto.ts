import { ApiProperty } from '@nestjs/swagger';
import { IdentityType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class LookupIdentityRequestDto {
  @ApiProperty({ enum: IdentityType, description: 'Type of the identity' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(IdentityType)
  type: IdentityType;

  @ApiProperty({
    description:
      'The raw public value to look up (e.g., phone number, email, social handle)',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  publicValue: string;
}
