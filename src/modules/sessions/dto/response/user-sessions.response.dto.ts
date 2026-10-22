import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { AssociatedDeviceResponseDto } from './associated-device.response.dto';
import { SessionResponseDto } from './session.response.dto';

/**
 * Composite response containing active user sessions and associated devices.
 */
export class UserSessionsResponseDto {
  @ApiProperty({
    description:
      'List of currently active authenticated sessions across devices',
    type: [SessionResponseDto],
  })
  @Expose()
  @Type(() => SessionResponseDto)
  sessions: SessionResponseDto[];

  @ApiProperty({
    description:
      'List of devices registered for notifications under the customer account',
    type: [AssociatedDeviceResponseDto],
  })
  @Expose()
  @Type(() => AssociatedDeviceResponseDto)
  registeredDevices: AssociatedDeviceResponseDto[];

  @ApiProperty({
    description: 'Total number of active authenticated sessions',
    example: 2,
  })
  @Expose()
  totalActiveSessions: number;
}
