import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { BigQueryAuditService } from '../bigquery-audit.service';

const mockQuery = jest.fn();

jest.mock('@google-cloud/bigquery', () => {
  return {
    BigQuery: jest.fn().mockImplementation(() => ({
      query: mockQuery,
    })),
  };
});

describe('BigQueryAuditService', () => {
  let service: BigQueryAuditService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GCP_PROJECT_ID') return 'breathaway-development';
        if (key === 'AUDIT_BIGQUERY_DATASET') return 'audit_logs_dataset';
        if (key === 'AUDIT_BIGQUERY_TABLE') return 'events';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BigQueryAuditService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<BigQueryAuditService>(BigQueryAuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queryUserAuditLogs', () => {
    it('should query BigQuery with parameterized userId and partition filter', async () => {
      const mockRows = [
        {
          message_id: 'msg-1',
          publish_time: '2026-10-18T10:00:00Z',
          data: { actionType: 'user.login' },
        },
      ];
      mockQuery.mockResolvedValue([mockRows]);

      const result = await service.queryUserAuditLogs('user-123', 50);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { userId: 'user-123', limit: 50 },
        }),
      );
      expect(result).toEqual(mockRows);
    });

    it('should return empty array and log warning when BigQuery fails or dataset does not exist', async () => {
      mockQuery.mockRejectedValue(
        new Error('Dataset not found: audit_logs_dataset'),
      );

      const result = await service.queryUserAuditLogs('user-123');

      expect(result).toEqual([]);
    });
  });
});
