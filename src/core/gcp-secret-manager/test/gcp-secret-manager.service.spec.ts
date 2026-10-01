import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { GcpSecretManagerService } from '../gcp-secret-manager.service';

const mockGetProjectId = jest.fn();
const mockAddSecretVersion = jest.fn();
const mockAccessSecretVersion = jest.fn();
const mockClose = jest.fn();

jest.mock('@google-cloud/secret-manager', () => {
  return {
    SecretManagerServiceClient: jest.fn().mockImplementation(() => {
      return {
        getProjectId: mockGetProjectId,
        addSecretVersion: mockAddSecretVersion,
        accessSecretVersion: mockAccessSecretVersion,
        close: mockClose,
      };
    }),
  };
});

describe('GcpSecretManagerService', () => {
  let service: GcpSecretManagerService;
  let mockLogger: {
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
    forContext: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      forContext: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        GcpSecretManagerService,
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<GcpSecretManagerService>(GcpSecretManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertSecret', () => {
    it('should successfully add a new secret version', async () => {
      mockGetProjectId.mockResolvedValue('test-project-123');
      mockAddSecretVersion.mockResolvedValue([{}]);

      await service.upsertSecret('test-secret', 'secret-val');

      expect(mockGetProjectId).toHaveBeenCalled();
      expect(mockAddSecretVersion).toHaveBeenCalledWith({
        parent: 'projects/test-project-123/secrets/test-secret',
        payload: {
          data: Buffer.from('secret-val', 'utf8'),
        },
      });
    });

    it('should throw an error if adding secret version fails', async () => {
      const error = new Error('GCP Error');
      mockGetProjectId.mockResolvedValue('test-project-123');
      mockAddSecretVersion.mockRejectedValue(error);

      await expect(
        service.upsertSecret('test-secret', 'secret-val'),
      ).rejects.toThrow(error);
    });
  });

  describe('getSecret', () => {
    it('should successfully retrieve the latest secret version payload', async () => {
      mockGetProjectId.mockResolvedValue('test-project-123');
      mockAccessSecretVersion.mockResolvedValue([
        {
          payload: {
            data: Buffer.from('my-secret-token', 'utf8'),
          },
        },
      ]);

      const result = await service.getSecret('access-token-instagram');

      expect(mockGetProjectId).toHaveBeenCalled();
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project-123/secrets/access-token-instagram/versions/latest',
      });
      expect(result).toBe('my-secret-token');
    });

    it('should throw an error if secret payload is empty or missing', async () => {
      mockGetProjectId.mockResolvedValue('test-project-123');
      mockAccessSecretVersion.mockResolvedValue([
        {
          payload: {
            data: null,
          },
        },
      ]);

      await expect(service.getSecret('access-token-instagram')).rejects.toThrow(
        "Secret 'access-token-instagram' payload is empty or not readable",
      );
    });

    it('should throw an error if accessSecretVersion fails', async () => {
      const error = new Error('Permission denied');
      mockGetProjectId.mockResolvedValue('test-project-123');
      mockAccessSecretVersion.mockRejectedValue(error);

      await expect(service.getSecret('access-token-instagram')).rejects.toThrow(
        error,
      );
    });

    it('should use GCP_PROJECT_ID from ConfigService without calling client.getProjectId', async () => {
      const mockConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'GCP_PROJECT_ID') return 'config-project-id';
          return undefined;
        }),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: ConfigService, useValue: mockConfigService },
          GcpSecretManagerService,
          { provide: LoggerService, useValue: mockLogger },
        ],
      }).compile();

      const svcWithConfig = testModule.get<GcpSecretManagerService>(
        GcpSecretManagerService,
      );

      mockAccessSecretVersion.mockResolvedValue([
        {
          payload: {
            data: Buffer.from('my-secret-token', 'utf8'),
          },
        },
      ]);

      const result = await svcWithConfig.getSecret('access-token-instagram');

      expect(result).toBe('my-secret-token');
      expect(mockConfigService.get).toHaveBeenCalledWith('GCP_PROJECT_ID');
      expect(mockGetProjectId).not.toHaveBeenCalled();
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/config-project-id/secrets/access-token-instagram/versions/latest',
      });
    });

    it('should cache projectId and invoke client.getProjectId only once across multiple operations', async () => {
      mockGetProjectId.mockResolvedValue('test-project-123');
      mockAccessSecretVersion.mockResolvedValue([
        {
          payload: {
            data: Buffer.from('token-1', 'utf8'),
          },
        },
      ]);
      mockAddSecretVersion.mockResolvedValue([{}]);

      await service.getSecret('secret-a');
      await service.getSecret('secret-b');
      await service.upsertSecret('secret-c', 'value-c');

      expect(mockGetProjectId).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close SecretManagerServiceClient client connection', async () => {
      await service.onModuleDestroy();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
