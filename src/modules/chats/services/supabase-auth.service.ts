import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

@Injectable()
export class SupabaseAuthService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    super(logger);
  }

  /**
   * Mints a short-lived custom JWT for the client to authenticate with Supabase.
   * Ensures the `sub` claim is the userId so Supabase RLS (`auth.uid()`) works,
   * includes `aud: 'authenticated'`, and attaches the `kid` header if configured.
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

    const keyId = this.configService.get<string>('SUPABASE_JWT_KEY_ID');
    if (!keyId) {
      this.logger.warn(
        'SUPABASE_JWT_KEY_ID is missing. Supabase Realtime may reject custom ES256 tokens without a kid header.',
        { step: 'generate_token' },
      );
    }

    // Support both actual newlines and escaped newlines from .env
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

    const signOptions: JwtSignOptions = {
      secret: formattedPrivateKey,
      algorithm: 'ES256',
      expiresIn: '1h',
    };

    if (keyId) {
      signOptions.keyid = keyId;
    }

    return this.jwtService.sign(
      {
        sub: userId,
        role: 'authenticated',
        aud: 'authenticated',
      },
      signOptions,
    );
  }
}
