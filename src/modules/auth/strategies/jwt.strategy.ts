import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '@infrastructure/database/prisma.service';

import { JwtAuthCacheService } from '../services/jwt-auth-cache.service';

interface JwtPayload {
  sub: string;
  email?: string;
  jti?: string;
  familyId?: string;
  [key: string]: unknown;
}

/**
 * Passport strategy validating JSON Web Tokens (JWT) provided in Bearer Authorization headers.
 *
 * Verifies the token signature, audience, and expiration constraints. Employs a Redis-backed
 * short-TTL cache for active user checks to keep authorization latency under 1ms, falling back
 * to PostgreSQL to verify that the user account exists and has not been deactivated or soft-deleted.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtAuthCacheService: JwtAuthCacheService,
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
   * Validates decoded JWT payloads against the active user cache and PostgreSQL database.
   *
   * Rejects requests if the user has been deleted or deactivated (resolving OWASP CWE-613).
   *
   * @param payload - Decoded JWT claims.
   * @returns An authenticated request user shape with userId and email.
   * @throws {UnauthorizedException} When the user does not exist or has been soft-deleted.
   */
  async validate(payload: JwtPayload) {
    // 1. Check Redis cache first (if enabled and operational)
    const isCachedActive = await this.jwtAuthCacheService.isUserActive(
      payload.sub,
      payload.jti,
    );

    if (isCachedActive) {
      return {
        userId: payload.sub,
        email: payload.email,
        jti: payload.jti,
        familyId: payload.familyId,
      };
    }

    // 2. Cache miss: verify whether this specific token has been explicitly revoked
    const isRevoked = await this.jwtAuthCacheService.isTokenRevoked(
      payload.jti,
    );
    if (isRevoked) {
      throw new UnauthorizedException('Session has been revoked');
    }

    // 3. Cache miss or cache disabled: query PostgreSQL via Prisma
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

    // 4. Populate Redis cache for subsequent requests within the configured TTL
    await this.jwtAuthCacheService.setUserActive(payload.sub, payload.jti);

    return {
      userId: payload.sub,
      email: payload.email,
      jti: payload.jti,
      familyId: payload.familyId,
    };
  }
}
