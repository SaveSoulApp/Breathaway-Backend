import { ExtractJwt, Strategy } from 'passport-jwt';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

interface JwtPayload {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Passport strategy validating JSON Web Tokens (JWT) provided in Bearer Authorization headers.
 *
 * Loads token constraints (secret key, audience, and optional issuer validation) from environment variables.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),
      issuer: configService.get<string>('JWT_ISSUER'),
    });
  }

  /**
   * Maps valid, decoded JWT payloads to the standard request user shape.
   *
   * Automatically invoked by Passport once signature and expiration validation succeeds.
   * The returned user object is injected into the NestJS context as `request.user`.
   *
   * @param payload - Decoded JWT claims.
   * @returns A parsed user profile object containing the user's ID and email.
   */
  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
