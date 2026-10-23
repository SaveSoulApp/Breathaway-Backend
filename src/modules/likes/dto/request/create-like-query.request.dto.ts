import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Query parameters for POST /likes — controls synchronous vs asynchronous match resolution.
 *
 * Defaults to synchronous match resolution (`async = false`).
 * When `async = true`, match resolution runs in the background.
 */
export class CreateLikeQueryDto {
  @ApiPropertyOptional({
    description:
      'When true, match resolution runs in the background. Defaults to false (synchronous match resolution).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  async?: boolean = false;
}
