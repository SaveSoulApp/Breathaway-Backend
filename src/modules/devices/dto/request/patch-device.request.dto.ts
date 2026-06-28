import { PartialType } from '@nestjs/swagger';

import { CreateDeviceRequestDto } from './create-device.request.dto';

/**
 * Payload for partially updating a device record.
 *
 * Submitted to PATCH /devices/:id. Inherits all fields and validation constraints
 * from CreateDeviceRequestDto, marking all properties as optional.
 */
export class PatchDeviceRequestDto extends PartialType(CreateDeviceRequestDto) {}
