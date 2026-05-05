import { IsNotEmpty, IsString } from 'class-validator';

export class AuthSigninDto {
  @IsString()
  @IsNotEmpty()
  uidToken: string;

  @IsString()
  @IsNotEmpty()
  uid: string;
}
