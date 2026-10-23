import { Injectable, NotFoundException } from '@nestjs/common';
import { Device, Prisma, UserSession } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { IpGeolocationService } from '@infrastructure/ip-geolocation';
import { AuditActionType } from '@modules/audit/dto';
import { JwtAuthCacheService } from '@modules/auth/services/jwt-auth-cache.service';

import {
  AssociatedDeviceResponseDto,
  RevokeOtherSessionsResponseDto,
  SessionDeviceDto,
  SessionResponseDto,
  UserSessionsResponseDto,
} from './dto';
import { SessionMetadataParser } from './utils/session-metadata.parser';

/**
 * Handles business logic for querying active user sessions and associated devices,
 * and performing remote session terminations.
 */
@Injectable()
export class SessionsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly jwtAuthCacheService: JwtAuthCacheService,
    private readonly ipGeolocationService: IpGeolocationService,
  ) {
    super(logger);
  }

  /**
   * Retrieves all active sessions and registered push devices for the authenticated user,
   * correlating device status, User-Agent metadata, and current session markers.
   *
   * @param userId - ID of the authenticated user.
   * @param currentFamilyId - Session lineage familyId from the calling access token.
   * @param currentDeviceId - Device ID from the request headers.
   * @returns Composite response with active sessions and registered devices.
   */
  async getUserSessions(
    userId: string,
    currentFamilyId?: string,
    currentDeviceId?: string,
  ): Promise<UserSessionsResponseDto> {
    const ctx = { userId, step: 'fetch_user_sessions' };
    this.logger.debug('Fetching user active sessions and devices', ctx);

    const now = DateUtil.now();

    // 1. Fetch active sessions and registered devices in parallel
    const [activeSessions, registeredDevices] = await Promise.all([
      this.prisma.userSession.findMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.device.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    // 2. Index devices by deviceId for O(1) correlation
    const deviceMap = new Map<string, Device>();
    for (const device of registeredDevices) {
      if (device.deviceId) {
        // Keep the most recently updated device if multiple exist
        if (!deviceMap.has(device.deviceId)) {
          deviceMap.set(device.deviceId, device);
        }
      }
    }

    // Set of device IDs that currently have an active session
    const activeDeviceIds = new Set<string>();

    // 3. Resolve tentative geolocation for distinct session IP addresses in parallel
    const uniqueIps = [
      ...new Set(
        activeSessions
          .map((s) => s.ipAddress)
          .filter((ip): ip is string => Boolean(ip)),
      ),
    ];

    const locationEntries = await Promise.all(
      uniqueIps.map(async (ip) => {
        const loc = await this.ipGeolocationService.getLocationByIp(ip);
        return [ip, loc] as const;
      }),
    );
    const locationMap = new Map(locationEntries);

    // 4. Transform sessions into response DTOs
    const sessions: SessionResponseDto[] = activeSessions.map((session) => {
      if (session.deviceId) {
        activeDeviceIds.add(session.deviceId);
      }

      const matchingDevice = session.deviceId
        ? deviceMap.get(session.deviceId)
        : undefined;

      const parsedUa = SessionMetadataParser.parse(session.userAgent);

      const isCurrent = this.isCurrentSession(
        session,
        currentFamilyId,
        currentDeviceId,
      );

      const location = session.ipAddress
        ? (locationMap.get(session.ipAddress) ?? null)
        : null;

      const deviceDto: SessionDeviceDto = {
        deviceId: session.deviceId ?? null,
        platform: matchingDevice?.platform ?? parsedUa.platform,
        deviceModel: parsedUa.deviceModel,
        os: parsedUa.os,
        browser: parsedUa.browser,
        appVersion: matchingDevice?.appVersion ?? parsedUa.appVersion,
        pushEnabled: matchingDevice?.isActive ?? false,
      };

      return {
        id: session.id,
        familyId: session.familyId,
        isCurrent,
        ipAddress: session.ipAddress ?? null,
        location,
        device: deviceDto,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.updatedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      };
    });

    // 5. Transform registered devices into response DTOs
    const devicesDto: AssociatedDeviceResponseDto[] = registeredDevices.map(
      (device) => ({
        id: device.id,
        deviceId: device.deviceId ?? null,
        platform: device.platform,
        appVersion: device.appVersion ?? null,
        isActive: device.isActive,
        hasActiveSession: device.deviceId
          ? activeDeviceIds.has(device.deviceId)
          : false,
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString(),
      }),
    );

    this.logger.debug('User sessions and devices fetched successfully', {
      ...ctx,
      activeSessionsCount: sessions.length,
      registeredDevicesCount: devicesDto.length,
    });

    return {
      sessions,
      registeredDevices: devicesDto,
      totalActiveSessions: sessions.length,
    };
  }

  /**
   * Revokes a specific active session by its ID or familyId, deactivating
   * its associated push device and clearing cached authorizations in Redis.
   *
   * @param userId - ID of the authenticated user.
   * @param sessionIdOrFamilyId - Session ULID or lineage familyId to terminate.
   */
  async revokeSession(
    userId: string,
    sessionIdOrFamilyId: string,
  ): Promise<void> {
    const ctx = {
      userId,
      sessionIdOrFamilyId,
      step: 'revoke_session',
    };
    this.logger.log('Revoking user session', ctx);

    // 1. Verify existence of the active session
    const session = await this.prisma.userSession.findFirst({
      where: {
        userId,
        OR: [{ id: sessionIdOrFamilyId }, { familyId: sessionIdOrFamilyId }],
        revokedAt: null,
      },
    });

    if (!session) {
      this.logger.warn('Session not found or already revoked', ctx);
      throw new NotFoundException('Session not found or already revoked');
    }

    const now = DateUtil.now();

    // 2. Mark entire session lineage as revoked in PostgreSQL
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        familyId: session.familyId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    // 3. Deactivate associated device in Device table if deviceId is present
    if (session.deviceId) {
      await this.prisma.device.updateMany({
        where: {
          userId,
          deviceId: session.deviceId,
          isActive: true,
        },
        data: { isActive: false },
      });
    }

    // 4. Invalidate Redis active status for this specific token
    if (session.jti) {
      await this.jwtAuthCacheService.revokeUser(userId, session.jti);
    }

    // 5. Emit security audit event
    this.emitAuditLog({
      actionType: AuditActionType.USER_LOGOUT,
      userId,
      resourceId: session.id,
      metadata: {
        familyId: session.familyId,
        deviceId: session.deviceId,
        step: 'remote_session_revoked',
      },
    });

    this.logger.debug('Session successfully revoked', ctx);
  }

  /**
   * Terminates all other active sessions for the user except the currently active session.
   *
   * @param userId - ID of the authenticated user.
   * @param currentFamilyId - Lineage familyId of the current session to preserve.
   * @param currentDeviceId - Device ID of the current session.
   * @returns Total count of revoked session lineages.
   */
  async revokeAllOtherSessions(
    userId: string,
    currentFamilyId?: string,
    currentDeviceId?: string,
  ): Promise<RevokeOtherSessionsResponseDto> {
    const ctx = {
      userId,
      currentFamilyId,
      currentDeviceId,
      step: 'revoke_all_other_sessions',
    };
    this.logger.log('Revoking all other active sessions', ctx);

    const now = DateUtil.now();

    // 1. Build where clause to preserve the current session lineage
    const whereClause: Prisma.UserSessionWhereInput = {
      userId,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(currentFamilyId && { familyId: { not: currentFamilyId } }),
    };

    // 2. Revoke in PostgreSQL
    const result = await this.prisma.userSession.updateMany({
      where: whereClause,
      data: { revokedAt: now },
    });

    // 3. Deactivate other push devices if current device is known
    if (currentDeviceId) {
      await this.prisma.device.updateMany({
        where: {
          userId,
          deviceId: { not: currentDeviceId },
          isActive: true,
        },
        data: { isActive: false },
      });
    }

    // 4. Emit security audit event
    this.emitAuditLog({
      actionType: AuditActionType.USER_LOGOUT,
      userId,
      metadata: {
        revokedCount: result.count,
        preservedFamilyId: currentFamilyId,
        step: 'revoke_other_sessions',
      },
    });

    this.logger.debug('All other sessions revoked successfully', {
      ...ctx,
      revokedCount: result.count,
    });

    return { revokedCount: result.count };
  }

  /**
   * Helper to determine whether a session row represents the caller's active session.
   */
  private isCurrentSession(
    session: UserSession,
    currentFamilyId?: string,
    currentDeviceId?: string,
  ): boolean {
    if (currentFamilyId) {
      return session.familyId === currentFamilyId;
    }
    if (currentDeviceId && session.deviceId) {
      return session.deviceId === currentDeviceId;
    }
    return false;
  }
}
