import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { Device } from '@prisma/client';

export interface INotificationProvider {
  /**
   * Sends a notification payload to the specified users and devices
   *
   * @param payload The request DTO containing the message, metadata, and userIds
   * @param devices Optional resolved devices from Prisma (useful for FCM)
   */
  send(payload: SendNotificationRequestDto, devices?: Device[]): Promise<void>;
}
