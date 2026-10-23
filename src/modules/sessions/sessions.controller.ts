import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import {
  ApiStandardErrors,
  CurrentFamilyId,
  CurrentUserId,
  DeviceId,
} from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { SESSIONS_REVOKE_THROTTLE } from './constants';
import { RevokeOtherSessionsResponseDto, UserSessionsResponseDto } from './dto';
import { SessionsService } from './sessions.service';

/**
 * Handles HTTP operations for querying active user sessions, correlating associated
 * devices, and remotely revoking authenticated sessions across devices.
 */
@ApiTags('Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'sessions',
  version: ['1'],
})
export class SessionsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly sessionsService: SessionsService,
  ) {
    super(logger);
  }

  /**
   * Retrieves all active sessions for the current authenticated user along with
   * associated devices registered under their account.
   */
  @Get()
  @ApiOperation({ summary: 'List all active sessions and associated devices' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Active sessions and devices retrieved successfully',
    type: UserSessionsResponseDto,
  })
  @SerializeExpose(UserSessionsResponseDto)
  @HttpCode(HttpStatus.OK)
  async getUserSessions(
    @CurrentUserId() userId: string,
    @CurrentFamilyId() currentFamilyId?: string,
    @DeviceId() currentDeviceId?: string,
  ): Promise<UserSessionsResponseDto> {
    return this.sessionsService.getUserSessions(
      userId,
      currentFamilyId,
      currentDeviceId,
    );
  }

  /**
   * Revokes a specific active session by its ID or familyId (remote sign-out).
   */
  @Delete(':id')
  @Throttle(SESSIONS_REVOKE_THROTTLE)
  @ApiOperation({
    summary: 'Revoke a specific active session (log out of device)',
  })
  @ApiParam({
    name: 'id',
    description: 'Session record ID (ULID) or lineage familyId to revoke',
    example: '01M5JE3XNEF6Y4J41BZSV10R7F',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Session successfully revoked',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found or already revoked',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUserId() userId: string,
    @Param('id') sessionId: string,
  ): Promise<void> {
    await this.sessionsService.revokeSession(userId, sessionId);
  }

  /**
   * Revokes all other active sessions for the authenticated user except the
   * current session making this request.
   */
  @Delete()
  @Throttle(SESSIONS_REVOKE_THROTTLE)
  @ApiOperation({
    summary: 'Revoke all other active sessions except the current one',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All other sessions successfully revoked',
    type: RevokeOtherSessionsResponseDto,
  })
  @SerializeExpose(RevokeOtherSessionsResponseDto)
  @HttpCode(HttpStatus.OK)
  async revokeAllOtherSessions(
    @CurrentUserId() userId: string,
    @CurrentFamilyId() currentFamilyId?: string,
    @DeviceId() currentDeviceId?: string,
  ): Promise<RevokeOtherSessionsResponseDto> {
    return this.sessionsService.revokeAllOtherSessions(
      userId,
      currentFamilyId,
      currentDeviceId,
    );
  }
}
