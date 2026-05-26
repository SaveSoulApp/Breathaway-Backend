import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { FirebaseService } from '@modules/firebase/firebase.service';
import { Injectable } from '@nestjs/common';
import { Device, DevicePlatform } from '@prisma/client';
import * as admin from 'firebase-admin';
import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { INotificationProvider } from './notification-provider.interface';

export interface FcmPayload {
  notification: {
    title?: string;
    body?: string;
  };
  data: Record<string, string>;
  apns?: admin.messaging.ApnsConfig;
  android?: admin.messaging.AndroidConfig;
}

@Injectable()
export class FcmProviderService
  extends BaseService
  implements INotificationProvider
{
  constructor(
    loggerService: LoggerService,
    private readonly firebaseService: FirebaseService,
  ) {
    super(loggerService);
  }

  async send(
    payloadDto: SendNotificationRequestDto,
    devices?: Device[],
  ): Promise<void> {
    if (!devices || devices.length === 0) {
      this.logger.warn('No devices provided for FCM push notification');
      return;
    }

    const iosTokens: string[] = [];
    const androidTokens: string[] = [];

    devices.forEach((device) => {
      if (device.token) {
        if (device.platform === DevicePlatform.IOS) {
          iosTokens.push(device.token);
        } else if (device.platform === DevicePlatform.ANDROID) {
          androidTokens.push(device.token);
        }
      }
    });

    this.logger.log(
      `Found ${iosTokens.length} iOS and ${androidTokens.length} Android devices for FCM`,
    );

    const promises: Promise<void>[] = [];

    if (iosTokens.length > 0) {
      const iosPayload = this.createIosPayload(payloadDto);
      promises.push(this.sendToFcm(iosTokens, iosPayload, DevicePlatform.IOS));
    }

    if (androidTokens.length > 0) {
      const androidPayload = this.createAndroidPayload(payloadDto);
      promises.push(
        this.sendToFcm(androidTokens, androidPayload, DevicePlatform.ANDROID),
      );
    }

    const results = await Promise.allSettled(promises);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(`FCM notification batch ${index} failed:`, {
          error: result.reason,
        });
      }
    });
  }

  private async sendToFcm(
    tokens: string[],
    payload: FcmPayload,
    platform: DevicePlatform,
  ): Promise<void> {
    try {
      const messaging = this.firebaseService.getMessaging();

      if (tokens.length === 0) {
        return;
      }

      // For multiple tokens, use sendEachForMulticast for better performance
      if (tokens.length > 1) {
        const message: admin.messaging.MulticastMessage = {
          tokens,
          notification: payload.notification,
          data: payload.data,
          apns: platform === DevicePlatform.IOS ? payload.apns : undefined,
          android:
            platform === DevicePlatform.ANDROID ? payload.android : undefined,
        };

        const batchResponse = await messaging.sendEachForMulticast(message);
        this.logger.log(
          `Successfully sent ${batchResponse.successCount} FCM notifications, ${batchResponse.failureCount} failed`,
        );

        if (batchResponse.failureCount > 0) {
          batchResponse.responses.forEach((response, index) => {
            if (!response.success) {
              this.logger.error(
                `Failed to send FCM to token ${tokens[index]}:`,
                { error: response.error },
              );
            }
          });
        }
      } else {
        // Single token
        const message: admin.messaging.Message = {
          token: tokens[0],
          notification: payload.notification,
          data: payload.data,
          apns: platform === DevicePlatform.IOS ? payload.apns : undefined,
          android:
            platform === DevicePlatform.ANDROID ? payload.android : undefined,
        };

        await messaging.send(message);
        this.logger.log('Successfully sent FCM notification to single device');
      }
    } catch (error) {
      this.logger.error('Failed to send FCM notifications:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private createBasePayload(dto: SendNotificationRequestDto): FcmPayload {
    return {
      notification: {
        title: dto.title,
        body: dto.body,
      },
      data: this.convertDataToStrings({
        type: dto.type,
        category: dto.category,
        payload: dto.payload || {},
        id: dto.id || Date.now().toString(),
        title: dto.title,
        body: dto.body,
      }),
    };
  }

  private createIosPayload(dto: SendNotificationRequestDto): FcmPayload {
    return {
      ...this.createBasePayload(dto),
      apns: {
        payload: {
          aps: {
            alert: {
              title: dto.title,
              body: dto.body,
            },
            badge: dto.badge,
            sound: dto.sound,
            'content-available': 1,
          },
        },
      },
    };
  }

  private createAndroidPayload(dto: SendNotificationRequestDto): FcmPayload {
    return {
      ...this.createBasePayload(dto),
      android: {
        priority:
          dto.priority === NotificationPriority.HIGH ? 'high' : 'normal',
        notification: {
          channelId:
            dto.priority === NotificationPriority.HIGH
              ? 'high_priority'
              : 'default',
          sound: dto.sound,
        },
      },
    };
  }

  private convertDataToStrings(
    data: Record<string, unknown>,
  ): Record<string, string> {
    const convertedData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        convertedData[key] =
          typeof value === 'object'
            ? JSON.stringify(value)
            : String(value as string | number | boolean);
      }
    }
    return convertedData;
  }
}
