import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GenderType } from '@prisma/client';
import { Expose } from 'class-transformer';

export class ProfileResponseDto {
  @ApiProperty({ description: 'Profile ID (ULID)' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Associated user ID' })
  @Expose()
  userId: string;

  @ApiProperty({ description: 'First name of the user' })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name of the user' })
  @Expose()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Date of birth' })
  @Expose()
  dateOfBirth?: Date;

  @ApiPropertyOptional({ description: 'Gender of the user', enum: GenderType })
  @Expose()
  gender?: GenderType;

  @ApiProperty({ description: 'Profile creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Profile last update timestamp' })
  @Expose()
  updatedAt: Date;
}
