import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for PATCH /likes/:id/label — sets or clears the user's personal annotation on a like.
 *
 * The label is purely cosmetic and is never shown to the target person. Omitting `label`
 * or sending `null` removes any existing annotation.
 */
export class UpdateLikeLabelRequestDto {
  @ApiPropertyOptional({
    description:
      "A personal label to remember who this like is for (e.g. 'Sarah', 'My Crush'). Send null to clear.",
    maxLength: 100,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string | null;
}
