import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateIdentityDto {
  @ApiPropertyOptional({
    description: 'Public value (e.g., phone number, email, social handle)',
  })
  @IsOptional()
  @IsString()
  publicValue?: string;

  @ApiPropertyOptional({
    description: 'Constant numeric platform ID (e.g., Instagram numerical ID)',
  })
  @IsOptional()
  @IsString()
  platformId?: string;
}
