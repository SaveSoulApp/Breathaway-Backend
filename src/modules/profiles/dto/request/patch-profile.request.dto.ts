import { PartialType } from '@nestjs/swagger';
import { CreateProfileRequestDto } from './create-profile.request.dto';

export class PatchProfileRequestDto extends PartialType(CreateProfileRequestDto) {}
