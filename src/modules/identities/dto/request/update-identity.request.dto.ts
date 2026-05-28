import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class UpdateIdentityDto {
  @ApiPropertyOptional({
    description: 'Public value (e.g., phone number, email, social handle)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  publicValue?: string;

  @ApiPropertyOptional({
    description: 'Constant numeric platform ID (e.g., Instagram numerical ID)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  platformId?: string;
}
