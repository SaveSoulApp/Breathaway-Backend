import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  IWhatsAppAdapter,
  WhatsAppSendPayload,
} from './whatsapp-adapter.interface';

/**
 * WhatsApp transport adapter integrating with LiteApp plugin API.
 * Endpoint: POST {LITEAPP_WHATSAPP_URL}/api/routes/plugins/whatsapp/send
 */
@Injectable()
export class LiteAppWhatsAppAdapter
  extends BaseService
  implements IWhatsAppAdapter
{
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(loggerService);

    const rawUrl =
      this.configService.get<string>('LITEAPP_WHATSAPP_URL') ||
      'https://dev.liteapp.store';
    this.baseUrl = rawUrl.replace(/\/+$/, '');

    this.apiKey = this.configService.get<string>('LITEAPP_WHATSAPP_KEY') ?? '';
    if (!this.apiKey) {
      this.logger.warn(
        'LITEAPP_WHATSAPP_KEY is not configured — LiteApp WhatsApp dispatch will fail at runtime',
        { step: 'init' },
      );
    }
  }

  /**
   * Dispatches a single WhatsApp template message via LiteApp.
   *
   * Retry contract:
   * - 200 OK: Marked sent; never retried.
   * - 429 Too Many Requests: Reads Retry-After header and retries once.
   * - All other error statuses: Logged and never retried.
   */
  async send(payload: WhatsAppSendPayload): Promise<void> {
    if (!this.apiKey) {
      this.logger.error(
        'Cannot send WhatsApp message: LITEAPP_WHATSAPP_KEY is not configured',
        { to: payload.to, template: payload.template, step: 'send' },
      );
      throw new Error(
        '[LiteApp] Cannot send WhatsApp message: LITEAPP_WHATSAPP_KEY is not configured',
      );
    }

    if (!payload.to) {
      this.logger.error(
        'Cannot send WhatsApp message: recipient phone number is missing',
        { template: payload.template, step: 'send' },
      );
      throw new Error(
        '[LiteApp] Cannot send WhatsApp message: recipient phone number is missing',
      );
    }

    const endpoint = `${this.baseUrl}/api/routes/plugins/whatsapp/send`;
    const requestBody: Record<string, unknown> = {
      to: payload.to,
      template: payload.template,
      language: payload.language ?? 'en',
      ...(payload.params ?? {}),
    };

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      await this.executePost(endpoint, requestBody, headers);

      this.logger.log('WhatsApp message sent successfully via LiteApp', {
        to: payload.to,
        template: payload.template,
        step: 'send_complete',
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        await this.handleRateLimitRetry(
          endpoint,
          requestBody,
          headers,
          error,
          payload,
        );
        return;
      }

      this.logAndThrowSendError(error, payload);
    }
  }

  private async executePost(
    endpoint: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<void> {
    await axios.post(endpoint, body, {
      headers,
      timeout: 10000,
    });
  }

  private async handleRateLimitRetry(
    endpoint: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
    initialError: AxiosError,
    payload: WhatsAppSendPayload,
  ): Promise<void> {
    const rawRetryAfter = (
      initialError.response?.headers as Record<string, unknown> | undefined
    )?.['retry-after'];
    let retryAfterSec = 5;

    if (
      typeof rawRetryAfter === 'string' ||
      typeof rawRetryAfter === 'number'
    ) {
      const parsed = parseInt(String(rawRetryAfter), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        retryAfterSec = Math.min(parsed, 60); // Cap at 60s safety limit
      }
    }

    this.logger.warn(
      'Rate limited (429) by LiteApp WhatsApp API, retrying once',
      {
        to: payload.to,
        template: payload.template,
        retryAfterSec,
        step: 'rate_limit_retry',
      },
    );

    await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));

    try {
      await this.executePost(endpoint, body, headers);

      this.logger.log(
        'WhatsApp message sent successfully via LiteApp on retry',
        {
          to: payload.to,
          template: payload.template,
          step: 'send_retry_complete',
        },
      );
    } catch (retryError) {
      this.logger.error('WhatsApp send failed after 429 rate limit retry', {
        to: payload.to,
        template: payload.template,
        step: 'send_retry_failed',
        err: serializeError(retryError),
      });
      throw new Error(
        `LiteApp WhatsApp delivery failed on retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`,
      );
    }
  }

  private logAndThrowSendError(
    error: unknown,
    payload: WhatsAppSendPayload,
  ): never {
    const isAxios = axios.isAxiosError(error);
    const status = isAxios ? error.response?.status : undefined;
    const responseData = isAxios
      ? (error.response?.data as unknown)
      : undefined;

    this.logger.error('LiteApp WhatsApp message delivery failed', {
      to: payload.to,
      template: payload.template,
      status,
      responseData,
      step: 'send_failed',
      err: serializeError(error),
    });

    throw new Error(
      `LiteApp WhatsApp delivery failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
