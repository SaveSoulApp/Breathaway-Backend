import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request query parameters for GET /api/v1/instagram/refresh-token.
 */
export class RefreshInstagramTokenRequestDto {
  @ApiProperty({
    description: 'The active long-lived user access token to refresh',
    example: 'IGQWRP...',
    minLength: 10,
    maxLength: 1024,
  })
  @IsNotEmpty({ message: 'Instagram access token is required' })
  @IsString({ message: 'Instagram access token must be a string' })
  @MinLength(10, { message: 'Instagram access token is too short' })
  @MaxLength(1024, { message: 'Instagram access token is too long' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  token: string;
}
