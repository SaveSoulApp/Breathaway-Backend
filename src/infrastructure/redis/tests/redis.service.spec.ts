import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';

import { LoggerService } from '@core/logger';

import { REDIS_CLIENT } from '../redis.constants';
import { RedisService } from '../redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedisClient: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    smembers: jest.Mock;
    srem: jest.Mock;
    sismember: jest.Mock;
    expire: jest.Mock;
    ping: jest.Mock;
    ttl: jest.Mock;
  } | null;
  let mockLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let mockLoggerService: { forContext: jest.Mock };

  const createService = async (client: any) => {
    mockRedisClient = client;

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockLoggerService = {
      forContext: jest.fn().mockReturnValue(mockLogger),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    return module.get<RedisService>(RedisService);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when Redis client is configured', () => {
    beforeEach(async () => {
      const client = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        sadd: jest.fn(),
        smembers: jest.fn(),
        srem: jest.fn(),
        sismember: jest.fn(),
        expire: jest.fn(),
        ping: jest.fn(),
        ttl: jest.fn(),
      };
      service = await createService(client);
    });

    it('isConfigured returns true', () => {
      expect(service.isConfigured).toBe(true);
    });

    it('rawClient returns the client instance', () => {
      expect(service.rawClient).toBe(mockRedisClient);
    });

    it('get returns value from Redis', async () => {
      mockRedisClient!.get.mockResolvedValue('test-val');
      const result = await service.get('my-key');

      expect(mockRedisClient!.get).toHaveBeenCalledWith('my-key');
      expect(result).toBe('test-val');
    });

    it('get rethrows error and logs when Redis throws', async () => {
      const err = new Error('Connection reset');
      mockRedisClient!.get.mockRejectedValue(err);

      await expect(service.get('my-key')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis GET failed',
        expect.objectContaining({ key: 'my-key' }),
      );
    });

    it('set handles positional arguments (key, val, "EX", ttl, "NX")', async () => {
      mockRedisClient!.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'val', 'EX', 300, 'NX');

      expect(mockRedisClient!.set).toHaveBeenCalledWith(
        'my-key',
        'val',
        'EX',
        300,
        'NX',
      );
      expect(result).toBe('OK');
    });

    it('set handles positional arguments (key, val, "EX", ttl)', async () => {
      mockRedisClient!.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'val', 'EX', 300);

      expect(mockRedisClient!.set).toHaveBeenCalledWith(
        'my-key',
        'val',
        'EX',
        300,
      );
      expect(result).toBe('OK');
    });

    it('set handles shorthand numeric TTL', async () => {
      mockRedisClient!.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'val', 120);

      expect(mockRedisClient!.set).toHaveBeenCalledWith(
        'my-key',
        'val',
        'EX',
        120,
      );
      expect(result).toBe('OK');
    });

    it('set handles options object with ttlSeconds and nx', async () => {
      mockRedisClient!.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'val', {
        ttlSeconds: 60,
        nx: true,
      });

      expect(mockRedisClient!.set).toHaveBeenCalledWith(
        'my-key',
        'val',
        'EX',
        60,
        'NX',
      );
      expect(result).toBe('OK');
    });

    it('set handles options object with ttlSeconds only', async () => {
      mockRedisClient!.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'val', { ttlSeconds: 60 });

      expect(mockRedisClient!.set).toHaveBeenCalledWith(
        'my-key',
        'val',
        'EX',
        60,
      );
      expect(result).toBe('OK');
    });

    it('set handles options object with nx only', async () => {
      mockRedisClient!.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'val', { nx: true });

      expect(mockRedisClient!.set).toHaveBeenCalledWith('my-key', 'val', 'NX');
      expect(result).toBe('OK');
    });

    it('set handles plain set without options', async () => {
      mockRedisClient!.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'val');

      expect(mockRedisClient!.set).toHaveBeenCalledWith('my-key', 'val');
      expect(result).toBe('OK');
    });

    it('set rethrows error and logs when Redis throws', async () => {
      const err = new Error('SET failed');
      mockRedisClient!.set.mockRejectedValue(err);

      await expect(service.set('my-key', 'val')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis SET failed',
        expect.objectContaining({ key: 'my-key' }),
      );
    });

    it('del deletes key and returns count', async () => {
      mockRedisClient!.del.mockResolvedValue(1);
      const result = await service.del('my-key');

      expect(mockRedisClient!.del).toHaveBeenCalledWith('my-key');
      expect(result).toBe(1);
    });

    it('del deletes multiple keys and returns count', async () => {
      mockRedisClient!.del.mockResolvedValue(2);
      const result = await service.del('key-1', 'key-2');

      expect(mockRedisClient!.del).toHaveBeenCalledWith('key-1', 'key-2');
      expect(result).toBe(2);
    });

    it('del rethrows error and logs when Redis throws', async () => {
      const err = new Error('DEL failed');
      mockRedisClient!.del.mockRejectedValue(err);

      await expect(service.del('my-key')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis DEL failed',
        expect.objectContaining({ keys: ['my-key'] }),
      );
    });

    it('sadd adds members to set and returns count', async () => {
      mockRedisClient!.sadd.mockResolvedValue(2);
      const result = await service.sadd('set-key', 'm1', 'm2');

      expect(mockRedisClient!.sadd).toHaveBeenCalledWith('set-key', 'm1', 'm2');
      expect(result).toBe(2);
    });

    it('sadd rethrows error and logs when Redis throws', async () => {
      const err = new Error('SADD failed');
      mockRedisClient!.sadd.mockRejectedValue(err);

      await expect(service.sadd('set-key', 'm1')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis SADD failed',
        expect.objectContaining({ key: 'set-key' }),
      );
    });

    it('smembers returns all set members', async () => {
      mockRedisClient!.smembers.mockResolvedValue(['m1', 'm2']);
      const result = await service.smembers('set-key');

      expect(mockRedisClient!.smembers).toHaveBeenCalledWith('set-key');
      expect(result).toEqual(['m1', 'm2']);
    });

    it('smembers rethrows error and logs when Redis throws', async () => {
      const err = new Error('SMEMBERS failed');
      mockRedisClient!.smembers.mockRejectedValue(err);

      await expect(service.smembers('set-key')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis SMEMBERS failed',
        expect.objectContaining({ key: 'set-key' }),
      );
    });

    it('srem removes members from set and returns count', async () => {
      mockRedisClient!.srem.mockResolvedValue(1);
      const result = await service.srem('set-key', 'm1');

      expect(mockRedisClient!.srem).toHaveBeenCalledWith('set-key', 'm1');
      expect(result).toBe(1);
    });

    it('srem rethrows error and logs when Redis throws', async () => {
      const err = new Error('SREM failed');
      mockRedisClient!.srem.mockRejectedValue(err);

      await expect(service.srem('set-key', 'm1')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis SREM failed',
        expect.objectContaining({ key: 'set-key' }),
      );
    });

    it('sismember returns true when member belongs to set', async () => {
      mockRedisClient!.sismember.mockResolvedValue(1);
      const result = await service.sismember('set-key', 'm1');

      expect(mockRedisClient!.sismember).toHaveBeenCalledWith('set-key', 'm1');
      expect(result).toBe(true);
    });

    it('sismember returns false when member does not belong to set', async () => {
      mockRedisClient!.sismember.mockResolvedValue(0);
      const result = await service.sismember('set-key', 'm2');

      expect(mockRedisClient!.sismember).toHaveBeenCalledWith('set-key', 'm2');
      expect(result).toBe(false);
    });

    it('sismember rethrows error and logs when Redis throws', async () => {
      const err = new Error('SISMEMBER failed');
      mockRedisClient!.sismember.mockRejectedValue(err);

      await expect(service.sismember('set-key', 'm1')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis SISMEMBER failed',
        expect.objectContaining({ key: 'set-key', member: 'm1' }),
      );
    });

    it('expire sets TTL on key and returns 1 on success', async () => {
      mockRedisClient!.expire.mockResolvedValue(1);
      const result = await service.expire('key-1', 300);

      expect(mockRedisClient!.expire).toHaveBeenCalledWith('key-1', 300);
      expect(result).toBe(1);
    });

    it('expire rethrows error and logs when Redis throws', async () => {
      const err = new Error('EXPIRE failed');
      mockRedisClient!.expire.mockRejectedValue(err);

      await expect(service.expire('key-1', 300)).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis EXPIRE failed',
        expect.objectContaining({ key: 'key-1' }),
      );
    });

    it('ping delegates to client.ping', async () => {
      mockRedisClient!.ping.mockResolvedValue('PONG');
      const result = await service.ping();

      expect(mockRedisClient!.ping).toHaveBeenCalled();
      expect(result).toBe('PONG');
    });

    it('ttl delegates to client.ttl', async () => {
      mockRedisClient!.ttl.mockResolvedValue(250);
      const result = await service.ttl('my-key');

      expect(mockRedisClient!.ttl).toHaveBeenCalledWith('my-key');
      expect(result).toBe(250);
    });

    it('ttl rethrows error and logs when Redis throws', async () => {
      const err = new Error('TTL failed');
      mockRedisClient!.ttl.mockRejectedValue(err);

      await expect(service.ttl('my-key')).rejects.toThrow(err);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis TTL failed',
        expect.objectContaining({ key: 'my-key' }),
      );
    });
  });

  describe('when Redis client is null (unconfigured)', () => {
    beforeEach(async () => {
      service = await createService(null);
    });

    it('isConfigured returns false', () => {
      expect(service.isConfigured).toBe(false);
    });

    it('rawClient returns null', () => {
      expect(service.rawClient).toBeNull();
    });

    it('get returns null gracefully', async () => {
      const result = await service.get('any-key');
      expect(result).toBeNull();
    });

    it('set returns null gracefully', async () => {
      const result = await service.set('any-key', 'val');
      expect(result).toBeNull();
    });

    it('del returns 0 gracefully', async () => {
      const result = await service.del('any-key');
      expect(result).toBe(0);
    });

    it('sadd returns 0 gracefully', async () => {
      const result = await service.sadd('any-key', 'm1');
      expect(result).toBe(0);
    });

    it('smembers returns empty array gracefully', async () => {
      const result = await service.smembers('any-key');
      expect(result).toEqual([]);
    });

    it('srem returns 0 gracefully', async () => {
      const result = await service.srem('any-key', 'm1');
      expect(result).toBe(0);
    });

    it('sismember returns false gracefully', async () => {
      const result = await service.sismember('any-key', 'm1');
      expect(result).toBe(false);
    });

    it('expire returns 0 gracefully', async () => {
      const result = await service.expire('any-key', 300);
      expect(result).toBe(0);
    });

    it('ping returns null gracefully', async () => {
      const result = await service.ping();
      expect(result).toBeNull();
    });

    it('ttl returns -2 gracefully', async () => {
      const result = await service.ttl('any-key');
      expect(result).toBe(-2);
    });
  });
});
