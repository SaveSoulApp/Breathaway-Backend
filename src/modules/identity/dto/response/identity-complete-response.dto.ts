import { Expose } from 'class-transformer';
import { IdentityResponseDto } from './identity-response.dto';

export class IdentityCompleteResponseDto extends IdentityResponseDto {
  @Expose()
  publicValue: string;

  @Expose()
  platformId?: string | null;
}