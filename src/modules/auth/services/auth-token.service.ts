import { createHash } from 'crypto';

import {
  Inject,
  Injectable,
  OnModuleDestroy,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import Redis from 'ioredis';
import { nanoid } from 'nanoid';

import { safeCloseClient } from '@common/utils/cleanup.utils';
import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import {
  AUTH_REFRESH_GRACE_PREFIX,
  CONCURRENT_ROTATION_MAX_RETRIES,
  CONCURRENT_ROTATION_WAIT_MS,
  ROTATION_GRACE_PERIOD_MS,
  ROTATION_GRACE_TTL_SECONDS,
} from '../constants';
import { RefreshTokenRequestDto, UserAuthResponseDto } from '../dto';

/**
 * Handles JWT access token generation, refresh token lifecycle, and session revocation.
 *
 * Implements Refresh Token Rotation (RTR) with a 10-second grace window (leeway)
 * and token family reuse detection (RFC 6819 §5.2.2.3) to prevent token replay attacks
 * while protecting distributed clients (serverless SSR proxies, mobile cold starts,
 * and multi-tab applications) from race-induced logouts.
 */
@Injectable()
export class AuthTokenService extends BaseService implements OnModuleDestroy {
  /**
   * Process-local fallback cache for single-instance / test environments.
   */
  private readonly inMemoryGraceCache = new Map<
    string,
    { response: UserAuthResponseDto; expiresAt: number }
  >();

  constructor(
    logger: LoggerService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional()
    @Inject('REDIS_CLIENT')
    private readonly redisClient?: Redis,
  ) {
    super(logger);
  }

  /**
   * Closes the Redis client connection gracefully on module destruction.
   */
  async onModuleDestroy(): Promise<void> {
    await safeCloseClient(this.redisClient, this.logger, 'Redis', 'quit');
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
  ): Promise<UserAuthResponseDto> {
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
    const accessToken = this.jwtService.sign(
      {},
      {
        subject: user.id,
        audience,
        ...(issuer && { issuer }),
        jwtid: nanoid(24),
        expiresIn: accessExpiresInSeconds,
      },
    );

    // 2. Generate long-lived Refresh Token (Option B: Signed JWT with Family ID)
    const refreshJti = nanoid(32);
    const familyId =
      typeof metadata?.familyId === 'string' ? metadata.familyId : nanoid(24);

    const refreshPayload = {
      familyId,
      token_type: 'refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      subject: user.id,
      audience: `${audience}:refresh`,
      ...(issuer && { issuer }),
      jwtid: refreshJti,
      expiresIn: refreshExpiresInSeconds,
    });

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const deviceId =
      (metadata?.deviceId as string | undefined) ??
      this.cls?.get<string>('deviceId');
    const userAgent =
      (metadata?.userAgent as string | undefined) ??
      this.cls?.get<string>('userAgent');
    const ipAddress =
      (metadata?.ipAddress as string | undefined) ??
      this.cls?.get<string>('ipAddress');

    // 3. Persist session in PostgreSQL
    const prismaClient = tx ?? this.prisma;
    await prismaClient.userSession.create({
      data: {
        userId: user.id,
        jti: refreshJti,
        tokenHash,
        familyId,
        expiresAt: refreshTokenExpiresAt,
        deviceId,
        userAgent,
        ipAddress,
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
        ...(ipAddress && { ipAddress }),
        ...(metadata && { metadata }),
      });
    }

    return {
      userId: user.id,
      tokenType: 'Bearer',
      accessToken,
      expiresIn: accessExpiresInSeconds,
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
  }

  /**
   * Refreshes access and refresh tokens using Refresh Token Rotation (RTR).
   *
   * Accommodates concurrent requests (e.g. serverless SSR proxies, multiple browser tabs,
   * mobile cold starts) via an idempotent grace window (10s) backed by Upstash Redis and
   * process-local fallback. Any replay presented after the grace window triggers immediate
   * breach containment (RFC 6819 §5.2.2.3), terminating the entire session family.
   *
   * @param dto - Container for the refresh token.
   * @param metadata - Request context (e.g. IP, user agent).
   * @returns A fresh token pair with updated expirations (or the cached pair if within grace window).
   * @throws {UnauthorizedException} If token is invalid, expired, revoked, or account is deactivated.
   */
  async refreshToken(
    dto: RefreshTokenRequestDto,
    metadata?: Record<string, unknown>,
  ): Promise<UserAuthResponseDto> {
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
        ...(issuer && { issuer }),
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

    // 1. REUSE DETECTION WITH ROTATION LEEWAY / GRACE WINDOW:
    // If an already-revoked refresh token is presented:
    // - Within the grace window (<= 10s): return the identical cached token pair issued during rotation.
    // - After the grace window (> 10s): treat as token theft and terminate the entire session lineage.
    if (session.revokedAt !== null) {
      const timeSinceRevocation =
        DateUtil.now().getTime() - session.revokedAt.getTime();

      if (timeSinceRevocation <= ROTATION_GRACE_PERIOD_MS) {
        // Confirm user account has not been deactivated before serving cached response
        const user = await this.prisma.user.findFirst({
          where: { id: session.userId, deletedAt: null },
        });

        if (!user) {
          throw new UnauthorizedException(
            'User account is invalid or has been deactivated',
          );
        }

        const cachedResponse = await this.getCachedRotatedResponse(session.jti);
        if (cachedResponse) {
          this.logger.debug(
            'Concurrent refresh token request within rotation grace window served from cache',
            {
              step: 'rtr_grace_window_served',
              userId: session.userId,
              familyId: session.familyId,
              jti: session.jti,
              timeSinceRevocation,
            },
          );
          return cachedResponse;
        }
      }

      // Beyond grace window OR unresolvable cache: trigger RFC 6819 §5.2.2.3 breach containment
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
          timeSinceRevocation,
        },
      );

      throw new UnauthorizedException(
        'Revoked refresh token reuse detected. All sessions in this lineage have been terminated. Please sign in again.',
      );
    }

    // 2. Expiration validation
    if (session.expiresAt.getTime() <= DateUtil.now().getTime()) {
      throw new UnauthorizedException(
        'Refresh token has expired. Please sign in again.',
      );
    }

    // 3. Active user validation
    const user = await this.prisma.user.findFirst({
      where: { id: session.userId, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User account is invalid or has been deactivated',
      );
    }

    // 4. Atomic Session Rotation via Compare-and-Swap (CAS) in PostgreSQL
    let isRaceCondition = false;
    const rotationResponse = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.userSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: DateUtil.now() },
      });

      if (updateResult.count === 0) {
        // Parallel in-flight request already updated revokedAt milliseconds ago.
        isRaceCondition = true;
        return null;
      }

      return this.generateAuthResponse(
        user,
        {
          ...metadata,
          familyId: session.familyId,
          deviceId:
            (metadata?.deviceId as string | undefined) ?? session.deviceId,
          isRefresh: true,
        },
        tx,
      );
    });

    // 5. Handle CAS collision (parallel requests hitting the transaction at the exact same millisecond)
    if (isRaceCondition || !rotationResponse) {
      for (
        let attempt = 0;
        attempt < CONCURRENT_ROTATION_MAX_RETRIES;
        attempt++
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, CONCURRENT_ROTATION_WAIT_MS),
        );
        const cached = await this.getCachedRotatedResponse(session.jti);
        if (cached) {
          this.logger.debug(
            'Concurrent refresh race resolved via rotation grace cache',
            {
              step: 'concurrent_rtr_race_resolved',
              userId: session.userId,
              familyId: session.familyId,
              jti: session.jti,
              attempt: attempt + 1,
            },
          );
          return cached;
        }
      }

      // If cache never populated after retries, conclude breach or failed rotation
      await this.prisma.userSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: DateUtil.now() },
      });

      this.logger.warn(
        'Concurrent refresh token race unresolved; revoked entire token family',
        {
          step: 'concurrent_rtr_race_unresolved',
          userId: session.userId,
          familyId: session.familyId,
          reusedJti: session.jti,
        },
      );

      throw new UnauthorizedException(
        'Revoked refresh token reuse detected. All sessions in this lineage have been terminated. Please sign in again.',
      );
    }

    // 6. Cache the freshly issued token pair under the consumed JTI for the grace window
    await this.cacheRotatedResponse(session.jti, rotationResponse);

    return rotationResponse;
  }

  /**
   * Revokes active sessions for a user, either targeting a single session lineage or all sessions.
   * Clears any associated grace cache entries to prevent post-signout bypass.
   *
   * @param userId - ID of the authenticated user.
   * @param refreshToken - Optional specific refresh token to target for revocation.
   */
  async revokeSession(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const decoded: unknown = this.jwtService.decode(refreshToken);
        const record = decoded as Record<string, unknown> | null;

        if (typeof record?.jti === 'string') {
          this.inMemoryGraceCache.delete(record.jti);
          if (this.redisClient) {
            await this.redisClient
              .del(`${AUTH_REFRESH_GRACE_PREFIX}${record.jti}`)
              .catch(() => {});
          }
        }

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
   * Caches a freshly rotated token response both in-memory and in Redis (Upstash)
   * to accommodate rapid concurrent refresh requests during the rotation grace window.
   *
   * @param consumedJti - The JTI of the consumed/revoked refresh token.
   * @param response - The generated authentication response containing the new token pair.
   */
  private async cacheRotatedResponse(
    consumedJti: string,
    response: UserAuthResponseDto,
  ): Promise<void> {
    const expiresAt =
      DateUtil.now().getTime() + ROTATION_GRACE_TTL_SECONDS * 1000;

    // 1. Process-local cache fallback
    this.inMemoryGraceCache.set(consumedJti, { response, expiresAt });

    // 2. Distributed Redis cache across Cloud Run containers
    if (this.redisClient) {
      try {
        const cacheKey = `${AUTH_REFRESH_GRACE_PREFIX}${consumedJti}`;
        await this.redisClient.set(
          cacheKey,
          JSON.stringify(response),
          'EX',
          ROTATION_GRACE_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.warn(
          'Failed to cache rotated token pair in Redis, relying on local fallback',
          {
            step: 'cache_rotated_token_failed',
            jti: consumedJti,
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
    }
  }

  /**
   * Retrieves a cached rotated token response if available within the grace window.
   * Checks the in-memory fallback first, then distributed Redis.
   *
   * @param consumedJti - The JTI of the previously rotated refresh token.
   * @returns The cached authentication response, or null if not found or expired.
   */
  private async getCachedRotatedResponse(
    consumedJti: string,
  ): Promise<UserAuthResponseDto | null> {
    // 1. Check in-memory fallback
    const memoryEntry = this.inMemoryGraceCache.get(consumedJti);
    if (memoryEntry) {
      if (memoryEntry.expiresAt > DateUtil.now().getTime()) {
        return memoryEntry.response;
      }
      this.inMemoryGraceCache.delete(consumedJti);
    }

    // 2. Check distributed Redis
    if (this.redisClient) {
      try {
        const cacheKey = `${AUTH_REFRESH_GRACE_PREFIX}${consumedJti}`;
        const cached = await this.redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as UserAuthResponseDto;
        }
      } catch (err) {
        this.logger.warn('Failed to retrieve cached rotated token from Redis', {
          step: 'read_cached_token_failed',
          jti: consumedJti,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return null;
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
