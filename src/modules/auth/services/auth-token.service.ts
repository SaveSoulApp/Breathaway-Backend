import { createHash } from 'crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { nanoid } from 'nanoid';

import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import { RefreshTokenRequestDto } from '../dto/request/refresh-token.request.dto';

/**
 * Leeway window in milliseconds allowing rapid concurrent refresh requests
 * (e.g. parallel network requests on mobile app foregrounding) to succeed
 * without prematurely triggering token family reuse detection.
 */
const ROTATION_GRACE_PERIOD_MS = 15 * 1000;

/**
 * Handles JWT access token generation, refresh token lifecycle, and session revocation.
 *
 * Implements Refresh Token Rotation (RTR) and token family reuse detection (RFC 6819)
 * to prevent token replay attacks and post-logout session hijacking.
 */
@Injectable()
export class AuthTokenService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Generates a short-lived access token and a long-lived signed refresh token,
   * stores the session lineage in the database, and emits a login audit event.
   *
   * @param user - The User entity requesting authorization.
   * @param metadata - Request context (e.g. IP address, device, familyId for rotation).
   * @param tx - Optional active Prisma transaction client for atomic multi-write operations.
   * @returns An authenticated response containing access and refresh tokens with expiration metadata.
   */
  async generateAuthResponse(
    user: User,
    metadata?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ) {
    const accessExpiresIn = this.configService.get<string>(
      'JWT_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '14d',
    );
    const audience = this.configService.getOrThrow<string>('JWT_AUDIENCE');
    const issuer = this.configService.get<string>('JWT_ISSUER');

    const accessExpiresInSeconds = this.parseDurationToSeconds(
      accessExpiresIn,
      900,
    );
    const refreshExpiresInSeconds = this.parseDurationToSeconds(
      refreshExpiresIn,
      14 * 86400,
    );
    const refreshTokenExpiresAt = DateUtil.dayjs()
      .add(refreshExpiresInSeconds, 'second')
      .toDate();

    // 1. Generate short-lived Access Token
    const accessPayload = {
      sub: user.id,
      iss: issuer,
      aud: audience,
      jti: nanoid(24),
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: accessExpiresInSeconds,
    });

    // 2. Generate long-lived Refresh Token (Option B: Signed JWT with Family ID)
    const refreshJti = nanoid(32);
    const familyId =
      typeof metadata?.familyId === 'string' ? metadata.familyId : nanoid(24);

    const refreshPayload = {
      sub: user.id,
      iss: issuer,
      aud: `${audience}:refresh`,
      jti: refreshJti,
      familyId,
      token_type: 'refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: refreshExpiresInSeconds,
      audience: `${audience}:refresh`,
      issuer,
    });

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    // 3. Persist session in PostgreSQL
    const prismaClient = tx ?? this.prisma;
    await prismaClient.userSession.create({
      data: {
        userId: user.id,
        jti: refreshJti,
        tokenHash,
        familyId,
        expiresAt: refreshTokenExpiresAt,
        deviceId: metadata?.deviceId as string | undefined,
        userAgent: metadata?.userAgent as string | undefined,
        ipAddress: metadata?.ipAddress as string | undefined,
      },
    });

    this.logger.debug('JWT tokens issued and session recorded', {
      userId: user.id,
      familyId,
      step: 'jwt_issued',
    });

    if (!metadata?.isRefresh) {
      this.emitAuditLog({
        actionType: AuditActionType.USER_LOGIN,
        userId: user.id,
        ...(metadata && { metadata }),
      });
    }

    return {
      user_id: user.id,
      userId: user.id,
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: accessExpiresInSeconds,
      refresh_token: refreshToken,
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
    };
  }

  /**
   * Refreshes access and refresh tokens using Refresh Token Rotation (RTR).
   *
   * Detects and blocks replayed/compromised refresh tokens by revoking the entire
   * token family if an already consumed token is presented.
   *
   * @param dto - Container for the refresh token.
   * @param metadata - Request context (e.g. IP, user agent).
   * @returns A fresh token pair with updated expirations.
   * @throws {UnauthorizedException} If token is invalid, expired, revoked, or account is deactivated.
   */
  async refreshToken(
    dto: RefreshTokenRequestDto,
    metadata?: Record<string, unknown>,
  ) {
    const { refreshToken } = dto;
    const audience = this.configService.getOrThrow<string>('JWT_AUDIENCE');
    const issuer = this.configService.get<string>('JWT_ISSUER');

    let payload: {
      sub: string;
      jti: string;
      familyId: string;
      token_type?: string;
    };

    try {
      payload = this.jwtService.verify(refreshToken, {
        audience: `${audience}:refresh`,
        issuer,
      });
    } catch (err) {
      this.logger.warn('Refresh token cryptographic verification failed', {
        step: 'refresh_token_verify',
        error: err instanceof Error ? err.message : String(err),
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (
      !payload?.jti ||
      !payload?.familyId ||
      payload?.token_type !== 'refresh'
    ) {
      throw new UnauthorizedException('Invalid refresh token claims');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { jti: payload.jti },
    });

    if (!session) {
      throw new UnauthorizedException('Refresh token session not found');
    }

    // AUTOMATIC REUSE DETECTION WITH LEEWAY GRACE PERIOD:
    // If an already-revoked refresh token is presented, check if it's within the grace window
    // (accommodating concurrent requests or network retries from legitimate clients).
    if (session.revokedAt !== null) {
      const timeSinceRevocation =
        DateUtil.now().getTime() - session.revokedAt.getTime();

      if (timeSinceRevocation > ROTATION_GRACE_PERIOD_MS) {
        await this.prisma.userSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: DateUtil.now() },
        });

        this.logger.warn(
          'Refresh token reuse detected; revoked entire token family',
          {
            step: 'token_reuse_detected',
            userId: session.userId,
            familyId: session.familyId,
            reusedJti: session.jti,
          },
        );

        throw new UnauthorizedException(
          'Revoked refresh token reuse detected. All sessions in this lineage have been terminated. Please sign in again.',
        );
      }

      this.logger.debug(
        'Concurrent refresh token request within rotation grace window accepted',
        {
          step: 'rtr_grace_window_accepted',
          userId: session.userId,
          familyId: session.familyId,
          jti: session.jti,
        },
      );
    }

    // Expiration validation
    if (session.expiresAt.getTime() <= DateUtil.now().getTime()) {
      throw new UnauthorizedException(
        'Refresh token has expired. Please sign in again.',
      );
    }

    // Active user validation
    const user = await this.prisma.user.findFirst({
      where: { id: session.userId, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User account is invalid or has been deactivated',
      );
    }

    // Atomically consume current session (if not already revoked) and record rotated session in a transaction
    return this.prisma.$transaction(async (tx) => {
      if (session.revokedAt === null) {
        await tx.userSession.update({
          where: { id: session.id },
          data: { revokedAt: DateUtil.now() },
        });
      }

      return this.generateAuthResponse(
        user,
        {
          ...metadata,
          familyId: session.familyId,
          deviceId: session.deviceId,
          isRefresh: true,
        },
        tx,
      );
    });
  }

  /**
   * Revokes active sessions for a user, either targeting a single session lineage or all sessions.
   *
   * @param userId - ID of the authenticated user.
   * @param refreshToken - Optional specific refresh token to target for revocation.
   */
  async revokeSession(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const decoded: unknown = this.jwtService.decode(refreshToken);
        const record = decoded as Record<string, unknown> | null;

        if (typeof record?.familyId === 'string') {
          await this.prisma.userSession.updateMany({
            where: { userId, familyId: record.familyId, revokedAt: null },
            data: { revokedAt: DateUtil.now() },
          });
          return;
        }
      } catch {
        // Fall back to revoking all sessions
      }
    }

    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: DateUtil.now() },
    });
  }

  /**
   * Parses time duration strings (e.g. '15m', '14d', '30d') into equivalent seconds.
   *
   * @param duration - Time string with optional unit suffix (s, m, h, d, w, y).
   * @param defaultSeconds - Fallback duration in seconds.
   * @returns Converted duration in seconds.
   */
  private parseDurationToSeconds(
    duration: string,
    defaultSeconds: number,
  ): number {
    if (!duration) return defaultSeconds;
    const match = /^(\d+)([smhdwy]?)$/.exec(duration.trim());
    if (!match) return defaultSeconds;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      case 'w':
        return value * 604800;
      case 'y':
        return value * 31536000;
      default:
        return value;
    }
  }
}
