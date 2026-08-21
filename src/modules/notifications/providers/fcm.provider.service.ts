import { Injectable } from '@nestjs/common';
import { Device, DevicePlatform } from '@prisma/client';
import * as admin from 'firebase-admin';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { FirebaseService } from '@modules/firebase/firebase.service';

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
    private readonly prisma: PrismaService,
  ) {
    super(loggerService);
  }

  async send(
    payloadDto: SendNotificationRequestDto,
    devices?: Device[],
  ): Promise<void> {
    if (!devices || devices.length === 0) {
      this.logger.warn('No devices provided for FCM push notification', {
        step: 'device_check',
      });
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

    this.logger.debug(
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
        this.logger.error(`FCM notification batch ${index} failed`, {
          batchIndex: index,
          step: 'send_batch',
          err: serializeError(result.reason),
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

      // Deduplicate tokens before dispatch
      const uniqueTokens = [...new Set(tokens)];
      if (uniqueTokens.length === 0) {
        return;
      }

      const invalidTokens: string[] = [];

      // For multiple tokens, use sendEachForMulticast for better performance
      if (uniqueTokens.length > 1) {
        const message: admin.messaging.MulticastMessage = {
          tokens: uniqueTokens,
          notification: payload.notification,
          data: payload.data,
          apns: platform === DevicePlatform.IOS ? payload.apns : undefined,
          android:
            platform === DevicePlatform.ANDROID ? payload.android : undefined,
        };

        const batchResponse = await messaging.sendEachForMulticast(message);
        this.logger.log(
          `FCM multicast sent: ${batchResponse.successCount} succeeded, ${batchResponse.failureCount} failed`,
          {
            platform,
            successCount: batchResponse.successCount,
            failureCount: batchResponse.failureCount,
            step: 'fcm_multicast',
          },
        );

        if (batchResponse.failureCount > 0) {
          batchResponse.responses.forEach((response, index) => {
            if (!response.success) {
              const isInvalid = this.isInvalidTokenError(response.error);
              if (isInvalid) {
                invalidTokens.push(uniqueTokens[index]);
              }

              this.logger.error(
                'FCM multicast: individual token delivery failed',
                {
                  platform,
                  tokenIndex: index,
                  isInvalidToken: isInvalid,
                  step: 'fcm_multicast',
                  err: serializeError(response.error),
                },
              );
            }
          });
        }
      } else {
        // Single token
        const message: admin.messaging.Message = {
          token: uniqueTokens[0],
          notification: payload.notification,
          data: payload.data,
          apns: platform === DevicePlatform.IOS ? payload.apns : undefined,
          android:
            platform === DevicePlatform.ANDROID ? payload.android : undefined,
        };

        try {
          await messaging.send(message);
          this.logger.log('FCM single-device notification sent', {
            platform,
            step: 'fcm_single',
          });
        } catch (error) {
          const isInvalid = this.isInvalidTokenError(
            error as { code?: string; message?: string },
          );
          if (isInvalid) {
            invalidTokens.push(uniqueTokens[0]);
          }

          this.logger.error('FCM single token delivery failed', {
            platform,
            isInvalidToken: isInvalid,
            step: 'fcm_single',
            err: serializeError(error),
          });
        }
      }

      if (invalidTokens.length > 0) {
        await this.cleanupInvalidTokens(invalidTokens);
      }
    } catch (error) {
      this.logger.error('FCM send failed', {
        platform,
        step: 'fcm_send',
        err: serializeError(error),
      });
      throw error;
    }
  }

  private isInvalidTokenError(error?: {
    code?: string;
    message?: string;
  }): boolean {
    if (!error) return false;
    const errorCode = error.code ?? '';
    const errorMessage = error.message ?? '';

    return (
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'messaging/invalid-argument' ||
      errorCode === 'messaging/mismatched-credential' ||
      errorMessage.includes('NotRegistered') ||
      errorMessage.includes('invalid-registration-token') ||
      errorMessage.includes('registration-token-not-registered')
    );
  }

  private async cleanupInvalidTokens(tokens: string[]): Promise<void> {
    try {
      const result = await this.prisma.device.updateMany({
        where: { token: { in: tokens } },
        data: { isActive: false },
      });

      this.logger.warn('Deactivated stale/unregistered FCM device tokens', {
        deactivatedCount: result.count,
        step: 'token_cleanup',
      });
    } catch (error) {
      this.logger.error('Failed to deactivate stale FCM device tokens', {
        step: 'token_cleanup',
        err: serializeError(error),
      });
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
