import { PartialType } from '@nestjs/swagger';
import { CreateProfileDto } from './create-profile.dto';

export class PatchProfileDto extends PartialType(CreateProfileDto) {}
