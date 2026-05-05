import { IsNotEmpty, IsString } from 'class-validator';

export class AddSecondaryAuthDto {
  @IsString()
  @IsNotEmpty()
  uidToken: string;

  @IsString()
  @IsNotEmpty()
  uid: string;
}
