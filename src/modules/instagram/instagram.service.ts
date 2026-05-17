import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseService } from '@core/base';
import { GcpSecretManagerService } from '@core/gcp-secret-manager/gcp-secret-manager.service';
import { LoggerService } from '@core/logger';

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

  async refreshAccessToken(currentToken: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/refresh_access_token`, {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: currentToken,
        },
      });

      const newToken = response.data?.access_token;
      if (newToken) {
        await this.gcpSecretManager.upsertSecret(
          'access-token-instagram',
          newToken,
        );
      }

      return response.data;
    } catch (error) {
      throw new HttpException(
        error.response?.data || 'Failed to refresh token',
        error.response?.status || 500,
      );
    }
  }

  async refreshSystemAccessToken() {
    const accessToken = this.configService.get<string>(
      'INSTAGRAM_ACCESS_TOKEN',
    );
    if (!accessToken) {
      this.logger.error(
        'INSTAGRAM_ACCESS_TOKEN is not defined in the environment configuration.',
      );
      throw new InternalServerErrorException(
        'Instagram access token not configured.',
      );
    }

    return this.refreshAccessToken(accessToken);
  }
}
