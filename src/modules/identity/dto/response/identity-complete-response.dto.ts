import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IdentityResponseDto } from './identity-response.dto';

export class IdentityCompleteResponseDto extends IdentityResponseDto {
  @ApiProperty()
  @Expose()
  publicValue: string;

  @ApiPropertyOptional()
  @Expose()
  platformId?: string | null;
}
