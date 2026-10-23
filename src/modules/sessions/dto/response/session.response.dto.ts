import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { SessionDeviceDto } from './session-device.response.dto';
import { SessionLocationDto } from './session-location.response.dto';

/**
 * Represents an active authenticated session for the user.
 */
export class SessionResponseDto {
  @ApiProperty({
    description: 'Unique session identifier (ULID)',
    example: '01M5JE3XNEF6Y4J41BZSV10R7F',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Session lineage family identifier across token rotations',
    example: 'mYL0ZxWdgUxMBK7-NWFwWMSF',
  })
  @Expose()
  familyId: string;

  @ApiProperty({
    description:
      'Whether this session matches the active authorization credential making the request',
    example: true,
  })
  @Expose()
  isCurrent: boolean;

  @ApiPropertyOptional({
    description: 'Last observed client IP address',
    example: '49.43.243.115',
    nullable: true,
  })
  @Expose()
  ipAddress?: string | null;

  @ApiPropertyOptional({
    description:
      'Estimated geographic location resolved from client IP address',
    type: () => SessionLocationDto,
    nullable: true,
  })
  @Expose()
  @Type(() => SessionLocationDto)
  location?: SessionLocationDto | null;

  @ApiProperty({
    description: 'Device hardware and software metadata',
    type: () => SessionDeviceDto,
  })
  @Expose()
  @Type(() => SessionDeviceDto)
  device: SessionDeviceDto;

  @ApiProperty({
    description:
      'Timestamp when this session was initially created (first login)',
    example: '2026-10-22T18:31:32.782Z',
  })
  @Expose()
  createdAt: string;

  @ApiProperty({
    description: 'Timestamp when this session was last refreshed or active',
    example: '2026-10-22T18:31:32.782Z',
  })
  @Expose()
  lastActiveAt: string;

  @ApiProperty({
    description: 'Timestamp when the active refresh token expires',
    example: '2026-11-05T18:31:32.773Z',
  })
  @Expose()
  expiresAt: string;
}
