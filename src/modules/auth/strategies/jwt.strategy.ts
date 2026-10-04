import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '@infrastructure/database/prisma.service';

interface JwtPayload {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Passport strategy validating JSON Web Tokens (JWT) provided in Bearer Authorization headers.
 *
 * Verifies the token signature, audience, and expiration constraints. Additionally checks
 * that the user account exists and has not been deactivated or soft-deleted.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),
      issuer: configService.get<string>('JWT_ISSUER'),
    });
  }

  /**
   * Validates decoded JWT payloads against the active user records in the database.
   *
   * Rejects requests if the user has been deleted or deactivated (resolving OWASP CWE-613).
   *
   * @param payload - Decoded JWT claims.
   * @returns An authenticated request user shape with userId and email.
   * @throws {UnauthorizedException} When the user does not exist or has been soft-deleted.
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User account is invalid or has been deactivated',
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
