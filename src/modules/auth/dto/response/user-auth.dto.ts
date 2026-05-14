import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class UserAuthDto {
  @ApiPropertyOptional({ description: 'The unique user ID (used in login)' })
  @Expose()
  user_id?: string;

  @ApiPropertyOptional({ description: 'The unique user ID (used in signup)' })
  @Expose()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Status of the authentication (e.g. pending_verification)',
  })
  @Expose()
  status?: string;

  @ApiPropertyOptional({ description: 'User email address' })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ description: 'User phone number' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'JWT Access token for authentication' })
  @Expose()
  access_token?: string;
}
