import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class SupabaseAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Mints a short-lived custom JWT for the client to authenticate with Supabase.
   * Ensures the `sub` claim is the userId so Supabase RLS (`auth.uid()`) works.
   */
  generateToken(userId: string): string {
    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('Chat configuration is missing');
    }

    return this.jwtService.sign(
      {
        sub: userId,
        role: 'authenticated',
      },
      {
        secret,
        expiresIn: '1h',
      },
    );
  }
}
