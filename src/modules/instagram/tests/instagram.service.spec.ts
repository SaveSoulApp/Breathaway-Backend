import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { ClsService } from 'nestjs-cls';

import { GcpSecretManagerService } from '@core/gcp-secret-manager/gcp-secret-manager.service';
import { LoggerService } from '@core/logger';

import {
  InstagramGraphApiException,
  MissingInstagramConfigException,
} from '../application/exceptions';
import {
  DEFAULT_INSTAGRAM_SECRET_NAME,
  INSTAGRAM_SECRET_NAME_CONFIG_KEY,
} from '../instagram.constants';
import { InstagramService } from '../instagram.service';

jest.mock('axios');

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
  const mockedAxios = axios as jest.Mocked<typeof axios>;

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
      ],
    }).compile();

    service = module.get<InstagramService>(InstagramService);
    configService = module.get(ConfigService);
    gcpSecretManager = module.get(GcpSecretManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refreshAccessToken', () => {
    it('should successfully refresh access token and update GCP secret', async () => {
      const currentToken = 'old-token';
      const mockResponse = {
        data: {
          access_token: 'new-token',
          expires_in: 5184000,
        },
      };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshAccessToken(currentToken);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: currentToken,
          },
        },
      );
      expect(gcpSecretManager.upsertSecret).toHaveBeenCalledWith(
        DEFAULT_INSTAGRAM_SECRET_NAME,
        'new-token',
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should successfully refresh access token without updating GCP secret if newToken is absent', async () => {
      const currentToken = 'old-token';
      const mockResponse = {
        data: {
          some_other_field: 'value',
        },
      };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshAccessToken(currentToken);

      expect(mockedAxios.get).toHaveBeenCalledWith(
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
      mockedAxios.get.mockRejectedValueOnce(mockError);

      await expect(service.refreshAccessToken(currentToken)).rejects.toThrow(
        new InstagramGraphApiException({ error: 'Invalid token' }),
      );
    });

    it('should map Axios error to HttpException correctly when error has no response', async () => {
      const currentToken = 'old-token';
      const mockError = {};
      mockedAxios.get.mockRejectedValueOnce(mockError);

      await expect(service.refreshAccessToken(currentToken)).rejects.toThrow(
        new InstagramGraphApiException('Failed to refresh token'),
      );
    });
  });

  describe('refreshSystemAccessToken', () => {
    it('should refresh token using token retrieved from GCP Secret Manager', async () => {
      const mockSecretToken = 'secret-manager-token';
      gcpSecretManager.getSecret.mockResolvedValueOnce(mockSecretToken);

      const mockResponse = {
        data: {
          access_token: 'new-refreshed-token',
        },
      };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshSystemAccessToken();

      expect(gcpSecretManager.getSecret).toHaveBeenCalledWith(
        DEFAULT_INSTAGRAM_SECRET_NAME,
      );
      expect(configService.get).not.toHaveBeenCalledWith(
        'INSTAGRAM_ACCESS_TOKEN',
      );
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: mockSecretToken,
          },
        },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should fall back to configService if GCP Secret Manager fails to get secret', async () => {
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
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshSystemAccessToken();

      expect(gcpSecretManager.getSecret).toHaveBeenCalledWith(
        DEFAULT_INSTAGRAM_SECRET_NAME,
      );
      expect(configService.get).toHaveBeenCalledWith('INSTAGRAM_ACCESS_TOKEN');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: mockConfigToken,
          },
        },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should use custom INSTAGRAM_SECRET_NAME from configService if configured', async () => {
      const customSecretName = 'custom-instagram-secret';
      configService.get.mockImplementation((key: string) => {
        if (key === INSTAGRAM_SECRET_NAME_CONFIG_KEY) {
          return customSecretName;
        }
        return undefined;
      });

      const mockResponse = {
        data: {
          access_token: 'new-token-custom',
        },
      };
      gcpSecretManager.getSecret.mockResolvedValueOnce('stored-custom-token');
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      await service.refreshSystemAccessToken();

      expect(gcpSecretManager.getSecret).toHaveBeenCalledWith(customSecretName);
      expect(gcpSecretManager.upsertSecret).toHaveBeenCalledWith(
        customSecretName,
        'new-token-custom',
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
});
