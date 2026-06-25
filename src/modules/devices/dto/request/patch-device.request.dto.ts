import { PartialType } from '@nestjs/swagger';

import { CreateDeviceDto } from './create-device.request.dto';

/**
 * Payload for partially updating a device record.
 *
 * Submitted to PATCH /devices/:id. Inherits all fields and validation constraints
 * from CreateDeviceDto, marking all properties as optional.
 */
export class PatchDeviceDto extends PartialType(CreateDeviceDto) {}
