import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { GcpSecretName } from '@common/enums';
import { GcpSecretManagerService } from '@core/gcp-secret-manager/gcp-secret-manager.service';
import { LoggerService } from '@core/logger';
import { HttpClientService } from '@infrastructure/http';

import {
  InstagramGraphApiException,
  MissingInstagramConfigException,
} from '../application/exceptions';
import { InstagramService } from '../instagram.service';

describe('InstagramService', () => {
  let service: InstagramService;
  let configService: jest.Mocked<ConfigService>;
  let gcpSecretManager: jest.Mocked<GcpSecretManagerService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };
  let logger: Record<string, jest.Mock>;
  const mockHttpClient = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockGcpSecretManager = {
      upsertSecret: jest.fn(),
      getSecret: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        InstagramService,
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GcpSecretManagerService, useValue: mockGcpSecretManager },
        { provide: HttpClientService, useValue: mockHttpClient },
      ],
    }).compile();

    service = module.get<InstagramService>(InstagramService);
    configService = module.get(ConfigService);
    gcpSecretManager = module.get(GcpSecretManagerService);
  });

  const originalEnvToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  afterEach(() => {
    process.env.INSTAGRAM_ACCESS_TOKEN = originalEnvToken;
    jest.clearAllMocks();
  });

  describe('refreshAccessToken', () => {
    it('should successfully refresh user access token without updating GCP secret or process.env', async () => {
      const currentToken = 'user-token';
      const mockResponse = {
        data: {
          access_token: 'new-user-token',
          expires_in: 5184000,
        },
      };
      mockHttpClient.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshAccessToken(currentToken);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: currentToken,
          },
        },
      );
      expect(gcpSecretManager.upsertSecret).not.toHaveBeenCalled();
      expect(process.env.INSTAGRAM_ACCESS_TOKEN).toBe(originalEnvToken);
      expect(result).toEqual(mockResponse.data);
    });

    it('should successfully refresh access token without updating GCP secret if newToken is absent', async () => {
      const currentToken = 'old-token';
      const mockResponse = {
        data: {
          some_other_field: 'value',
        },
      };
      mockHttpClient.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshAccessToken(currentToken);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: currentToken,
          },
        },
      );
      expect(gcpSecretManager.upsertSecret).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponse.data);
    });

    it('should map Axios error to HttpException correctly when error has response', async () => {
      const currentToken = 'old-token';
      const mockError = {
        response: {
          data: { error: 'Invalid token' },
          status: 400,
        },
      };
      mockHttpClient.get.mockRejectedValueOnce(mockError);

      await expect(service.refreshAccessToken(currentToken)).rejects.toThrow(
        new InstagramGraphApiException({ error: 'Invalid token' }),
      );
    });

    it('should map Axios error to HttpException correctly when error has no response', async () => {
      const currentToken = 'old-token';
      const mockError = {};
      mockHttpClient.get.mockRejectedValueOnce(mockError);

      await expect(service.refreshAccessToken(currentToken)).rejects.toThrow(
        new InstagramGraphApiException('Failed to refresh token'),
      );
    });
  });

  describe('refreshSystemAccessToken', () => {
    it('should refresh token using token retrieved from GCP Secret Manager and persist new token to Secret Manager', async () => {
      const mockSecretToken = 'secret-manager-token';
      gcpSecretManager.getSecret.mockResolvedValueOnce(mockSecretToken);

      const mockResponse = {
        data: {
          access_token: 'new-refreshed-token',
        },
      };
      mockHttpClient.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshSystemAccessToken();

      expect(gcpSecretManager.getSecret).toHaveBeenCalledWith(
        GcpSecretName.INSTAGRAM_ACCESS_TOKEN,
      );
      expect(configService.get).not.toHaveBeenCalledWith(
        'INSTAGRAM_ACCESS_TOKEN',
      );
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: mockSecretToken,
          },
        },
      );
      expect(gcpSecretManager.upsertSecret).toHaveBeenCalledWith(
        GcpSecretName.INSTAGRAM_ACCESS_TOKEN,
        'new-refreshed-token',
      );
      expect(process.env.INSTAGRAM_ACCESS_TOKEN).toBe('new-refreshed-token');
      expect(result).toEqual(mockResponse.data);
    });

    it('should fall back to configService if GCP Secret Manager fails to get secret and persist to Secret Manager', async () => {
      gcpSecretManager.getSecret.mockRejectedValueOnce(
        new Error('Secret not found'),
      );
      const mockConfigToken = 'env-token';
      configService.get.mockImplementation((key: string) => {
        if (key === 'INSTAGRAM_ACCESS_TOKEN') {
          return mockConfigToken;
        }
        return undefined;
      });

      const mockResponse = {
        data: {
          access_token: 'new-env-token',
        },
      };
      mockHttpClient.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshSystemAccessToken();

      expect(gcpSecretManager.getSecret).toHaveBeenCalledWith(
        GcpSecretName.INSTAGRAM_ACCESS_TOKEN,
      );
      expect(configService.get).toHaveBeenCalledWith('INSTAGRAM_ACCESS_TOKEN');
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: mockConfigToken,
          },
        },
      );
      expect(gcpSecretManager.upsertSecret).toHaveBeenCalledWith(
        GcpSecretName.INSTAGRAM_ACCESS_TOKEN,
        'new-env-token',
      );
      expect(process.env.INSTAGRAM_ACCESS_TOKEN).toBe('new-env-token');
      expect(result).toEqual(mockResponse.data);
    });

    it('should not update Secret Manager if refreshed system token is absent', async () => {
      const mockSecretToken = 'secret-manager-token';
      gcpSecretManager.getSecret.mockResolvedValueOnce(mockSecretToken);

      const mockResponse = {
        data: {
          some_other_field: 'value',
        },
      };
      mockHttpClient.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshSystemAccessToken();

      expect(gcpSecretManager.upsertSecret).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponse.data);
    });

    it('should use GcpSecretName.INSTAGRAM_ACCESS_TOKEN directly when interacting with GCP Secret Manager', async () => {
      const mockSecretToken = 'secret-manager-token';
      gcpSecretManager.getSecret.mockResolvedValueOnce(mockSecretToken);

      const mockResponse = {
        data: {
          access_token: 'new-token-enum',
        },
      };
      mockHttpClient.get.mockResolvedValueOnce(mockResponse);

      await service.refreshSystemAccessToken();

      expect(gcpSecretManager.getSecret).toHaveBeenCalledWith(
        GcpSecretName.INSTAGRAM_ACCESS_TOKEN,
      );
      expect(gcpSecretManager.upsertSecret).toHaveBeenCalledWith(
        GcpSecretName.INSTAGRAM_ACCESS_TOKEN,
        'new-token-enum',
      );
    });

    it('should throw InternalServerErrorException if token is neither in Secret Manager nor configured in configService', async () => {
      gcpSecretManager.getSecret.mockRejectedValueOnce(
        new Error('Secret not found'),
      );
      configService.get.mockReturnValueOnce(undefined);

      await expect(service.refreshSystemAccessToken()).rejects.toThrow(
        new MissingInstagramConfigException(),
      );

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'INSTAGRAM_ACCESS_TOKEN is not configured',
        { step: 'refresh_system' },
      );
    });
  });

  describe('sendDirectMessage', () => {
    const recipientId = '17841400008460056';
    const messageText = 'Your identity has been verified!';

    it('should successfully send a direct message using token from Secret Manager', async () => {
      gcpSecretManager.getSecret.mockResolvedValueOnce('secret-manager-token');
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          recipient_id: recipientId,
          message_id: 'meta-msg-123',
        },
      });

      const result = await service.sendDirectMessage(recipientId, messageText);

      expect(gcpSecretManager.getSecret).toHaveBeenCalledWith(
        GcpSecretName.INSTAGRAM_ACCESS_TOKEN,
      );
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://graph.instagram.com/v24.0/me/messages',
        {
          recipient: { id: recipientId },
          message: { text: messageText },
        },
        {
          headers: {
            Authorization: 'Bearer secret-manager-token',
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result).toEqual({
        recipientId,
        messageId: 'meta-msg-123',
      });
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Instagram direct message sent successfully',
        expect.objectContaining({
          recipientId,
          messageId: 'meta-msg-123',
          step: 'complete',
        }),
      );
    });

    it('should use custom INSTAGRAM_GRAPH_API_VERSION when configured in ConfigService', async () => {
      gcpSecretManager.getSecret.mockResolvedValueOnce('secret-manager-token');
      configService.get.mockImplementation((key: string) => {
        if (key === 'INSTAGRAM_GRAPH_API_VERSION') return 'v25.0';
        return undefined;
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          recipient_id: recipientId,
          message_id: 'meta-msg-custom-ver',
        },
      });

      const result = await service.sendDirectMessage(recipientId, messageText);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://graph.instagram.com/v25.0/me/messages',
        expect.anything(),
        expect.anything(),
      );
      expect(result.messageId).toBe('meta-msg-custom-ver');
    });

    it('should fall back to ConfigService if Secret Manager fails and send message', async () => {
      gcpSecretManager.getSecret.mockRejectedValueOnce(
        new Error('Secret Manager error'),
      );
      configService.get.mockImplementation((key: string) => {
        if (key === 'INSTAGRAM_ACCESS_TOKEN') return 'config-token';
        return undefined;
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          recipient_id: recipientId,
          message_id: 'meta-msg-456',
        },
      });

      const result = await service.sendDirectMessage(recipientId, messageText);

      expect(configService.get).toHaveBeenCalledWith('INSTAGRAM_ACCESS_TOKEN');
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://graph.instagram.com/v24.0/me/messages',
        expect.anything(),
        {
          headers: {
            Authorization: 'Bearer config-token',
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result.messageId).toBe('meta-msg-456');
    });

    it('should throw MissingInstagramConfigException if token is not available', async () => {
      gcpSecretManager.getSecret.mockRejectedValueOnce(
        new Error('Secret not found'),
      );
      configService.get.mockReturnValueOnce(undefined);

      await expect(
        service.sendDirectMessage(recipientId, messageText),
      ).rejects.toThrow(MissingInstagramConfigException);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'INSTAGRAM_ACCESS_TOKEN is not configured',
        expect.objectContaining({
          recipientId,
          step: 'send_dm',
        }),
      );
    });

    it('should throw InstagramGraphApiException when Graph API request fails with error response', async () => {
      gcpSecretManager.getSecret.mockResolvedValueOnce('valid-token');
      mockHttpClient.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: {
              message: 'Invalid recipient ID',
              type: 'OAuthException',
              code: 100,
            },
          },
        },
      });

      await expect(
        service.sendDirectMessage(recipientId, messageText),
      ).rejects.toThrow(InstagramGraphApiException);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to send Instagram direct message',
        expect.objectContaining({
          recipientId,
          step: 'send_dm',
        }),
      );
    });

    it('should throw InstagramGraphApiException when Graph API fails without response body', async () => {
      gcpSecretManager.getSecret.mockResolvedValueOnce('valid-token');
      mockHttpClient.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        service.sendDirectMessage(recipientId, messageText),
      ).rejects.toThrow(InstagramGraphApiException);
    });
  });
});
