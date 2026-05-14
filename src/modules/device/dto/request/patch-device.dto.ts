import { PartialType } from '@nestjs/swagger';
import { CreateDeviceDto } from './create-device.dto';

export class PatchDeviceDto extends PartialType(CreateDeviceDto) {}
