import { Expose } from 'class-transformer';

export class UserAuthDto {
  @Expose()
  user_id: number;

  @Expose()
  email: string;

  @Expose()
  phone: string;

  @Expose()
  access_token: String
}
