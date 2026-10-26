import { Writable } from 'stream';

import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { GcpStorageService } from '../gcp-storage.service';

// Mock @google-cloud/storage
const mockFile = {
  createWriteStream: jest.fn().mockReturnValue(new Writable({ write() {} })),
  save: jest.fn().mockResolvedValue(undefined),
  getSignedUrl: jest
    .fn()
    .mockResolvedValue(['https://storage.googleapis.com/signed-url']),
  exists: jest.fn().mockResolvedValue([true]),
  delete: jest.fn().mockResolvedValue(undefined),
};

const mockBucket = {
  file: jest.fn().mockReturnValue(mockFile),
};

jest.mock('@google-cloud/storage', () => {
  return {
    Storage: jest.fn().mockImplementation(() => ({
      bucket: jest.fn().mockReturnValue(mockBucket),
    })),
  };
});

describe('GcpStorageService', () => {
  let service: GcpStorageService;

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
      get: jest.fn().mockReturnValue('breathaway-development'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcpStorageService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<GcpStorageService>(GcpStorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWriteStream', () => {
    it('should return a Writable stream targeting the destination object', () => {
      const stream = service.createWriteStream(
        'test-bucket',
        'test/path.zip',
        'application/zip',
        { userId: 'u1' },
      );

      expect(mockBucket.file).toHaveBeenCalledWith('test/path.zip');
      expect(mockFile.createWriteStream).toHaveBeenCalledWith({
        resumable: false,
        contentType: 'application/zip',
        metadata: { metadata: { userId: 'u1' } },
      });
      expect(stream).toBeDefined();
    });
  });

  describe('uploadBuffer', () => {
    it('should call file.save with the buffer and content type', async () => {
      const buffer = Buffer.from('test archive content');
      await service.uploadBuffer(
        'test-bucket',
        'test/path.zip',
        buffer,
        'application/zip',
      );

      expect(mockFile.save).toHaveBeenCalledWith(buffer, {
        resumable: false,
        contentType: 'application/zip',
        metadata: undefined,
      });
    });

    it('should throw InternalServerErrorException if save fails', async () => {
      mockFile.save.mockRejectedValue(new Error('GCS upload error'));

      await expect(
        service.uploadBuffer(
          'test-bucket',
          'test/path.zip',
          Buffer.from('test'),
          'application/zip',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getSignedDownloadUrl', () => {
    it('should call file.getSignedUrl with V4 parameters and return signed URL', async () => {
      const url = await service.getSignedDownloadUrl(
        'test-bucket',
        'test/path.zip',
        60,
      );

      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'read',
          expires: expect.any(Number),
        }),
      );
      expect(url).toBe('https://storage.googleapis.com/signed-url');
    });

    it('should throw InternalServerErrorException if getSignedUrl fails', async () => {
      mockFile.getSignedUrl.mockRejectedValue(new Error('Signing error'));

      await expect(
        service.getSignedDownloadUrl('test-bucket', 'test/path.zip', 60),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      mockFile.exists.mockResolvedValue([true]);
      const exists = await service.fileExists('test-bucket', 'test/path.zip');
      expect(exists).toBe(true);
    });

    it('should return false if exists check fails', async () => {
      mockFile.exists.mockRejectedValue(new Error('Network error'));
      const exists = await service.fileExists('test-bucket', 'test/path.zip');
      expect(exists).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('should call file.delete with ignoreNotFound', async () => {
      await service.deleteFile('test-bucket', 'test/path.zip');
      expect(mockFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    });
  });
});
