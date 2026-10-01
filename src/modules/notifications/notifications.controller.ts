import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  BatchReadResponseDto,
  GetNotificationsRequestDto,
  NotificationResponseDto,
  PaginatedNotificationsResponseDto,
  UnreadCountResponseDto,
} from './dto';
import { NotificationsService } from './notifications.service';

/**
 * Client-facing HTTP controller for the /notifications domain.
 *
 * Exposes in-app notification inbox feeds and read/dismiss mutations
 * for authenticated mobile and web users (guarded by JWT at class level).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'notifications',
  version: ['1'],
})
export class NotificationsController extends BaseController {
  constructor(
    loggerService: LoggerService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(loggerService);
  }

  /**
   * Fetches the current user's paginated notification inbox feed.
   */
  @Get()
  @ApiOperation({
    summary: 'Get notification inbox feed',
    description:
      'Returns a cursor-paginated list of notifications for the authenticated user, sorted newest first.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notifications retrieved successfully.',
    type: PaginatedNotificationsResponseDto,
  })
  async getNotifications(
    @CurrentUserId() userId: string,
    @Query() query: GetNotificationsRequestDto,
  ): Promise<PaginatedNotificationsResponseDto> {
    return this.notificationsService.getUserNotifications(userId, query);
  }

  /**
   * Returns the count of unread notifications for badge rendering.
   */
  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description:
      'Returns the number of unread notifications for the authenticated user to display badge counts.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unread count retrieved successfully.',
    type: UnreadCountResponseDto,
  })
  async getUnreadCount(
    @CurrentUserId() userId: string,
  ): Promise<UnreadCountResponseDto> {
    return this.notificationsService.getUnreadCount(userId);
  }

  /**
   * Marks a specific notification as read.
   */
  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description:
      'Marks a single notification as read for the authenticated user.',
  })
  @ApiParam({
    name: 'id',
    description: 'The notification ID to mark as read',
    example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification marked as read successfully.',
    type: NotificationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Notification not found or does not belong to user.',
  })
  async markAsRead(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markAsRead(userId, id);
  }

  /**
   * Marks all unread notifications as read for the current user.
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description:
      'Atomically marks all unread notifications as read for the authenticated user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All notifications marked as read successfully.',
    type: BatchReadResponseDto,
  })
  async markAllAsRead(
    @CurrentUserId() userId: string,
  ): Promise<BatchReadResponseDto> {
    return this.notificationsService.markAllAsRead(userId);
  }

  /**
   * Dismisses a notification from the user's active inbox view.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dismiss notification',
    description:
      'Hides a notification from the authenticated user’s active inbox view.',
  })
  @ApiParam({
    name: 'id',
    description: 'The notification ID to dismiss',
    example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Notification dismissed successfully.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Notification not found or does not belong to user.',
  })
  async dismissNotification(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notificationsService.dismissNotification(userId, id);
  }
}
