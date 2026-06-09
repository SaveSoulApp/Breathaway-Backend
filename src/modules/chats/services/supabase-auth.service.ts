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
    const privateKey = this.configService.get<string>(
      'SUPABASE_JWT_PRIVATE_KEY',
    );
    if (!privateKey) {
      throw new InternalServerErrorException(
        'Chat configuration is missing: SUPABASE_JWT_PRIVATE_KEY',
      );
    }

    // Support both actual newlines and escaped newlines from .env
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

    return this.jwtService.sign(
      {
        sub: userId,
        role: 'authenticated',
      },
      {
        secret: formattedPrivateKey,
        algorithm: 'ES256',
        expiresIn: '1h',
      },
    );
  }
}
