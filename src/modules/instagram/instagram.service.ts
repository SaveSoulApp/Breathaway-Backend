import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { GcpSecretManagerService } from '@core/gcp-secret-manager/gcp-secret-manager.service';
import { LoggerService } from '@core/logger';

import {
  InstagramGraphApiException,
  MissingInstagramConfigException,
} from './application/exceptions';
import {
  DEFAULT_INSTAGRAM_SECRET_NAME,
  INSTAGRAM_SECRET_NAME_CONFIG_KEY,
} from './instagram.constants';

/**
 * Manages Instagram access token lifecycle by communicating directly with the
 * Instagram Graph API and persisting refreshed system tokens to GCP Secret Manager.
 *
 * User-specific tokens (supplied by the caller) are refreshed in-memory without
 * mutating system secrets, while the system-wide token is retrieved from Secret Manager
 * or environment config, refreshed, and saved back to Secret Manager.
 */
@Injectable()
export class InstagramService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly gcpSecretManager: GcpSecretManagerService,
  ) {
    super(logger);
  }

  private readonly baseUrl = 'https://graph.instagram.com';

  /**
   * Resolves the Secret Manager secret identifier for the Instagram access token.
   *
   * Prefers `INSTAGRAM_SECRET_NAME` from ConfigService; falls back to `DEFAULT_INSTAGRAM_SECRET_NAME`.
   */
  private get instagramSecretName(): string {
    return (
      this.configService.get<string>(INSTAGRAM_SECRET_NAME_CONFIG_KEY) ??
      DEFAULT_INSTAGRAM_SECRET_NAME
    );
  }

  /**
   * Exchanges a long-lived Instagram access token for a new one via the Graph API.
   *
   * Caller-supplied tokens are refreshed in-memory and returned directly without
   * mutating system-wide secrets in GCP Secret Manager, protecting system tokens
   * from being overwritten.
   *
   * @param currentToken - The active long-lived user access token to refresh.
   * @returns The raw Graph API response object containing the new token and TTL.
   * @throws {InstagramGraphApiException} Propagates the Graph API error status and body when
   *   the token refresh request fails (e.g., token expired, invalid, or revoked).
   */
  async refreshAccessToken(currentToken: string): Promise<unknown> {
    this.logger.log('Refreshing Instagram access token', { step: 'init' });

    try {
      const response = await axios.get(`${this.baseUrl}/refresh_access_token`, {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: currentToken,
        },
      });

      const data = response.data as Record<string, unknown>;

      this.logger.log('Instagram access token refreshed successfully', {
        step: 'complete',
      });
      return data;
    } catch (error) {
      this.logger.error('Failed to refresh Instagram access token', {
        step: 'refresh',
        err: serializeError(error),
      });
      const err = error as {
        response?: { data?: string | Record<string, unknown>; status?: number };
      };
      throw new InstagramGraphApiException(
        err.response?.data || 'Failed to refresh token',
      );
    }
  }

  /**
   * Refreshes the system-level Instagram token by reading the current value from
   * GCP Secret Manager (with fallback to `INSTAGRAM_ACCESS_TOKEN` configuration),
   * refreshing it via the Graph API, and persisting the updated token back to
   * GCP Secret Manager.
   *
   * Designed for automated rotation jobs — no token needs to be supplied externally.
   * Logs and throws immediately if the config value is absent, preventing a silent
   * no-op rotation.
   *
   * @returns The raw Graph API response containing the new token and its expiry.
   * @throws {MissingInstagramConfigException} When `INSTAGRAM_ACCESS_TOKEN` is not
   *   available from Secret Manager or environment configuration.
   * @throws {InstagramGraphApiException} When the Graph API rejects the stored token.
   */
  async refreshSystemAccessToken(): Promise<unknown> {
    this.logger.log('Refreshing system Instagram access token', {
      step: 'init',
    });

    let accessToken: string | undefined;

    try {
      accessToken = await this.gcpSecretManager.getSecret(
        this.instagramSecretName,
      );
      this.logger.debug(
        'Retrieved system Instagram token from Secret Manager',
        { step: 'fetch_secret' },
      );
    } catch (error) {
      this.logger.warn(
        'Could not fetch token from Secret Manager, falling back to ConfigService',
        {
          step: 'fallback_config',
          err: serializeError(error),
        },
      );
      accessToken = this.configService.get<string>('INSTAGRAM_ACCESS_TOKEN');
    }

    if (!accessToken) {
      this.logger.error('INSTAGRAM_ACCESS_TOKEN is not configured', {
        step: 'refresh_system',
      });
      throw new MissingInstagramConfigException();
    }

    const result = await this.refreshAccessToken(accessToken);
    const data = result as Record<string, unknown>;
    const newToken = data?.access_token;
    if (typeof newToken === 'string') {
      await this.gcpSecretManager.upsertSecret(
        this.instagramSecretName,
        newToken,
      );
      process.env.INSTAGRAM_ACCESS_TOKEN = newToken;
      this.logger.debug('Refreshed system token persisted in Secret Manager', {
        step: 'persist_secret',
      });
    }

    this.logger.log('System Instagram access token refreshed successfully', {
      step: 'complete',
    });
    return result;
  }
}
