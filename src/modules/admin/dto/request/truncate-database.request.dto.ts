import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TruncateDatabaseRequestDto {
  @ApiProperty({
    description: 'Confirmation phrase required to execute database truncation',
    example: 'CONFIRM_TRUNCATE',
  })
  @IsNotEmpty()
  @IsString()
  @Equals('CONFIRM_TRUNCATE', {
    message: 'confirmation must be exactly "CONFIRM_TRUNCATE"',
  })
  confirmation: string;

  @ApiPropertyOptional({
    description: 'Optional operational reason for database reset',
    example: 'Reset test environment for internal testing',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
