import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GenderType } from '@prisma/client';

export class ProfileResponseDto {
  @ApiProperty({ description: 'Profile ID (ULID)' })
  id: string;

  @ApiProperty({ description: 'Associated user ID' })
  userId: string;

  @ApiProperty({ description: 'First name of the user' })
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name of the user' })
  lastName?: string;

  @ApiPropertyOptional({ description: 'Date of birth' })
  dateOfBirth?: Date;

  @ApiPropertyOptional({ description: 'Gender of the user', enum: GenderType })
  gender?: GenderType;

  @ApiProperty({ description: 'Profile creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Profile last update timestamp' })
  updatedAt: Date;
}