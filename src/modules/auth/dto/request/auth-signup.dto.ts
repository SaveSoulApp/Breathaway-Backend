import { IsNotEmpty, IsString } from 'class-validator';

export class AuthSignupDto {
  @IsString()
  @IsNotEmpty()
  uidToken: string;

  @IsString()
  @IsNotEmpty()
  uid: string;
}
