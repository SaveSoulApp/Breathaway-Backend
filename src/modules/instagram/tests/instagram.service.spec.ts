import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  InstagramGraphApiException,
  MissingInstagramConfigException,
} from '../application/exceptions';
import axios from 'axios';
import { LoggerService } from '@core/logger';
import { GcpSecretManagerService } from '@core/gcp-secret-manager/gcp-secret-manager.service';
import { InstagramService } from '../instagram.service';
import { ClsService } from 'nestjs-cls';

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
        'access-token-instagram',
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
    it('should refresh token using token from config', async () => {
      const mockToken = 'env-token';
      configService.get.mockReturnValueOnce(mockToken);

      const mockResponse = {
        data: {
          access_token: 'new-env-token',
        },
      };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.refreshSystemAccessToken();

      expect(configService.get).toHaveBeenCalledWith('INSTAGRAM_ACCESS_TOKEN');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: mockToken,
          },
        },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should throw InternalServerErrorException if token is not configured', async () => {
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
