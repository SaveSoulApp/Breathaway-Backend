import { PartialType } from '@nestjs/swagger';
import { CreateProfileDto } from './create-profile.request.dto';

export class PatchProfileDto extends PartialType(CreateProfileDto) {}
