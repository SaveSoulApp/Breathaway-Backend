import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
