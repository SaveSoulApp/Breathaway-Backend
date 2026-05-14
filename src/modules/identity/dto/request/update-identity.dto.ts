import { IsOptional, IsString } from 'class-validator';

export class UpdateIdentityDto {
  @IsOptional()
  @IsString()
  publicValue?: string;
}