import { PartialType } from '@nestjs/swagger';
import { CreateDeviceDto } from './create-device.request.dto';

export class PatchDeviceDto extends PartialType(CreateDeviceDto) {}
