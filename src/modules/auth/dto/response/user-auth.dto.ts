import { Expose } from 'class-transformer';

export class UserAuthDto {
  @Expose()
  user_id: string;

  @Expose()
  email: string;

  @Expose()
  phone: string;

  @Expose()
  access_token: string;
}
