import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyInstagramRequestDto {
  @IsString()
  @IsNotEmpty()
  instagramId: string;
}
