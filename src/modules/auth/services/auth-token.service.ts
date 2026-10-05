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
import { Prisma, User, UserSession } from '@prisma/client';
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
 * Decoded payload claims expected inside a signed refresh token JWT.
 */
interface RefreshTokenClaims {
  sub: string;
  jti: string;
  familyId: string;
  token_type?: string;
}

/**
 * Result of an atomic rotation transaction attempt.
 */
interface RotationResult {
  isCollision: boolean;
  response: UserAuthResponseDto | null;
}

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
  // Common JWT configuration properties initialized once at bootstrap
  private readonly audience: string;
  private readonly issuer?: string;
  private readonly accessExpiresInSeconds: number;
  private readonly refreshExpiresInSeconds: number;

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

    this.audience = this.configService.getOrThrow<string>('JWT_AUDIENCE');
    this.issuer = this.configService.get<string>('JWT_ISSUER');

    const accessExpiresIn = this.configService.get<string>(
      'JWT_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '14d',
    );

    this.accessExpiresInSeconds = this.parseDurationToSeconds(
      accessExpiresIn,
      900,
    );
    this.refreshExpiresInSeconds = this.parseDurationToSeconds(
      refreshExpiresIn,
      14 * 86400,
    );
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
    const refreshTokenExpiresAt = DateUtil.dayjs()
      .add(this.refreshExpiresInSeconds, 'second')
      .toDate();

    // 1. Generate short-lived Access Token
    const accessToken = this.jwtService.sign(
      {},
      {
        subject: user.id,
        audience: this.audience,
        ...(this.issuer && { issuer: this.issuer }),
        jwtid: nanoid(24),
        expiresIn: this.accessExpiresInSeconds,
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
      audience: `${this.audience}:refresh`,
      ...(this.issuer && { issuer: this.issuer }),
      jwtid: refreshJti,
      expiresIn: this.refreshExpiresInSeconds,
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
      expiresIn: this.accessExpiresInSeconds,
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
  }

  /**
   * Refreshes access and refresh tokens using Refresh Token Rotation (RTR).
   *
   * Orchestrates cryptographic verification, grace window checking, atomic database rotation,
   * CAS race resolution, and distributed response caching.
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
    const payload = this.verifyRefreshToken(dto.refreshToken);
    const session = await this.findSessionByJti(payload.jti);

    // 1. Handle already-revoked tokens: check grace window vs breach containment
    if (session.revokedAt !== null) {
      return this.handleRevokedSession(session);
    }

    // 2. Validate token expiration and active user status
    this.validateSessionExpiration(session);
    const user = await this.validateActiveUser(session.userId);

    // 3. Atomically rotate session via Compare-and-Swap (CAS) in PostgreSQL
    const { isCollision, response } = await this.executeAtomicRotation(
      session,
      user,
      metadata,
    );

    // 4. Resolve CAS race collision via cache polling if another request won the race
    if (isCollision || !response) {
      return this.resolveConcurrentCollision(session);
    }

    // 5. Cache the successful rotation response for subsequent requests within the grace window
    await this.cacheRotatedResponse(session.jti, response);

    return response;
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

  // ──────────────────────────────────────────────────────────────────────────
  // Private Helper Methods (Refactored Subroutines)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Cryptographically verifies the refresh token signature and extracts registered claims.
   *
   * @param refreshToken - Raw refresh token string.
   * @returns Validated token payload.
   * @throws {UnauthorizedException} If verification fails or claims are malformed.
   */
  private verifyRefreshToken(refreshToken: string): RefreshTokenClaims {
    let payload: RefreshTokenClaims;

    try {
      payload = this.jwtService.verify(refreshToken, {
        audience: `${this.audience}:refresh`,
        ...(this.issuer && { issuer: this.issuer }),
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

    return payload;
  }

  /**
   * Fetches the database session corresponding to the refresh token's JTI.
   *
   * @param jti - Unique identifier of the refresh token.
   * @returns UserSession record.
   * @throws {UnauthorizedException} If session does not exist.
   */
  private async findSessionByJti(jti: string): Promise<UserSession> {
    const session = await this.prisma.userSession.findUnique({
      where: { jti },
    });

    if (!session) {
      throw new UnauthorizedException('Refresh token session not found');
    }

    return session;
  }

  /**
   * Handles presentation of an already-revoked refresh token.
   *
   * Returns the cached token response if within the 10-second grace window,
   * otherwise triggers RFC 6819 §5.2.2.3 family revocation.
   *
   * @param session - Revoked UserSession record.
   * @returns Cached authentication response if within grace period.
   * @throws {UnauthorizedException} If outside grace window or reuse is detected.
   */
  private async handleRevokedSession(
    session: UserSession,
  ): Promise<UserAuthResponseDto> {
    const timeSinceRevocation =
      DateUtil.now().getTime() - session.revokedAt!.getTime();

    if (timeSinceRevocation <= ROTATION_GRACE_PERIOD_MS) {
      await this.validateActiveUser(session.userId);

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

    // Outside grace window OR cache unresolvable: trigger breach containment
    await this.terminateSessionFamily(
      session.familyId,
      'token_reuse_detected',
      {
        userId: session.userId,
        reusedJti: session.jti,
        timeSinceRevocation,
      },
    );

    throw new UnauthorizedException(
      'Revoked refresh token reuse detected. All sessions in this lineage have been terminated. Please sign in again.',
    );
  }

  /**
   * Validates that the session has not surpassed its absolute expiration timestamp.
   *
   * @param session - UserSession record.
   * @throws {UnauthorizedException} If session is expired.
   */
  private validateSessionExpiration(session: UserSession): void {
    if (session.expiresAt.getTime() <= DateUtil.now().getTime()) {
      throw new UnauthorizedException(
        'Refresh token has expired. Please sign in again.',
      );
    }
  }

  /**
   * Confirms the user account exists and has not been soft-deleted.
   *
   * @param userId - ID of the user.
   * @returns User entity.
   * @throws {UnauthorizedException} If user is missing or deactivated.
   */
  private async validateActiveUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User account is invalid or has been deactivated',
      );
    }

    return user;
  }

  /**
   * Executes the atomic Compare-and-Swap (CAS) update and session creation in a transaction.
   *
   * @param session - Current UserSession record.
   * @param user - Active User entity.
   * @param metadata - Request context metadata.
   * @returns Rotation result with collision flag and issued response.
   */
  private async executeAtomicRotation(
    session: UserSession,
    user: User,
    metadata?: Record<string, unknown>,
  ): Promise<RotationResult> {
    let isCollision = false;

    const response = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.userSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: DateUtil.now() },
      });

      if (updateResult.count === 0) {
        isCollision = true;
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

    return { isCollision, response };
  }

  /**
   * Resolves a concurrent CAS update collision by polling the cache for the winning request's response.
   *
   * @param session - UserSession record that failed CAS.
   * @returns The winning request's cached response.
   * @throws {UnauthorizedException} If polling fails to resolve within retry limits.
   */
  private async resolveConcurrentCollision(
    session: UserSession,
  ): Promise<UserAuthResponseDto> {
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
    await this.terminateSessionFamily(
      session.familyId,
      'concurrent_rtr_race_unresolved',
      {
        userId: session.userId,
        reusedJti: session.jti,
      },
    );

    throw new UnauthorizedException(
      'Revoked refresh token reuse detected. All sessions in this lineage have been terminated. Please sign in again.',
    );
  }

  /**
   * Terminates all active sessions in a family lineage upon security breach detection.
   *
   * @param familyId - Token family identifier to terminate.
   * @param step - Logging step context.
   * @param logContext - Additional structured metadata.
   */
  private async terminateSessionFamily(
    familyId: string,
    step: string,
    logContext: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: DateUtil.now() },
    });

    this.logger.warn(
      'Refresh token breach detected; terminated entire session family',
      {
        step,
        familyId,
        ...logContext,
      },
    );
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

    // Prune expired entries if the in-memory cache grows large
    if (this.inMemoryGraceCache.size > 500) {
      const now = DateUtil.now().getTime();
      for (const [key, val] of this.inMemoryGraceCache.entries()) {
        if (val.expiresAt <= now) {
          this.inMemoryGraceCache.delete(key);
        }
      }
    }

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
