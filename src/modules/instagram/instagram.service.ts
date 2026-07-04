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

/**
 * Manages Instagram access token lifecycle by communicating directly with the
 * Instagram Graph API and persisting refreshed tokens to GCP Secret Manager.
 *
 * Both user-specific tokens (supplied by the caller) and the system-wide token
 * (read from environment config) are handled here, keeping credential rotation
 * centralised and auditable.
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
   * Exchanges a long-lived Instagram access token for a new one via the Graph API
   * and writes the refreshed token to the `access-token-instagram` GCP secret.
   *
   * Token persistence uses an upsert so the secret is created on first rotation
   * and overwritten on subsequent calls. The full Graph API response is returned
   * to allow the caller to inspect expiry metadata.
   *
   * @param currentToken - The active long-lived user access token to refresh.
   * @returns The raw Graph API response object containing the new token and TTL.
   * @throws {HttpException} Propagates the Graph API error status and body when
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
      const newToken = data?.access_token;
      if (typeof newToken === 'string') {
        await this.gcpSecretManager.upsertSecret(
          'access-token-instagram',
          newToken,
        );
        this.logger.debug('Refreshed token persisted in Secret Manager', {
          step: 'persist_secret',
        });
      }

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
   * `INSTAGRAM_ACCESS_TOKEN` environment config and delegating to `refreshAccessToken`.
   *
   * Designed for automated rotation jobs — no token needs to be supplied externally.
   * Logs and throws immediately if the config value is absent, preventing a silent
   * no-op rotation.
   *
   * @returns The raw Graph API response containing the new token and its expiry.
   * @throws {InternalServerErrorException} When `INSTAGRAM_ACCESS_TOKEN` is not
   *   set in the environment configuration.
   * @throws {HttpException} When the Graph API rejects the stored token.
   */
  async refreshSystemAccessToken(): Promise<unknown> {
    this.logger.log('Refreshing system Instagram access token', {
      step: 'init',
    });

    const accessToken = this.configService.get<string>(
      'INSTAGRAM_ACCESS_TOKEN',
    );
    if (!accessToken) {
      this.logger.error('INSTAGRAM_ACCESS_TOKEN is not configured', {
        step: 'refresh_system',
      });
      throw new MissingInstagramConfigException();
    }

    const result = await this.refreshAccessToken(accessToken);
    this.logger.log('System Instagram access token refreshed successfully', {
      step: 'complete',
    });
    return result;
  }
}
