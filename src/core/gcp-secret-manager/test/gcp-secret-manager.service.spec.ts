import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { GcpSecretManagerService } from '../gcp-secret-manager.service';

const mockGetProjectId = jest.fn();
const mockAddSecretVersion = jest.fn();
const mockClose = jest.fn();

jest.mock('@google-cloud/secret-manager', () => {
  return {
    SecretManagerServiceClient: jest.fn().mockImplementation(() => {
      return {
        getProjectId: mockGetProjectId,
        addSecretVersion: mockAddSecretVersion,
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
    forContext: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
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

  describe('onModuleDestroy', () => {
    it('should close SecretManagerServiceClient client connection', async () => {
      await service.onModuleDestroy();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
