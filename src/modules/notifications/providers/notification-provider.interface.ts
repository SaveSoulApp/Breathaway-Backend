import { Device } from '@prisma/client';

import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';

export interface INotificationProvider {
  /**
   * Sends a notification payload to the specified users and devices
   *
   * @param payload The request DTO containing the message, metadata, and userIds
   * @param devices Optional resolved devices from Prisma (useful for FCM)
   * @param userNotificationIdMap Optional map of userId -> notificationId for bulk dispatches
   */
  send(
    payload: SendNotificationRequestDto,
    devices?: Device[],
    userNotificationIdMap?: Map<string, string>,
  ): Promise<void>;
}
