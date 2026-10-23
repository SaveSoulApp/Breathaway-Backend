import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { HttpClientService } from '@infrastructure/http';
import { RedisService } from '@infrastructure/redis';

import { IpLocation } from '../interfaces/ip-geolocation.interface';
import { IpGeolocationService } from '../ip-geolocation.service';

describe('IpGeolocationService', () => {
  let service: IpGeolocationService;
  let configService: jest.Mocked<ConfigService>;
  const mockHttpClient = {
    get: jest.fn(),
  };

  const mockRedisService = {
    isConfigured: true,
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockLogger = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };

  const createModule = async (options?: {
    token?: string;
    timeout?: number;
    redisConfigured?: boolean;
    redisService?: any;
  }) => {
    const token = options && 'token' in options ? options.token : 'test-token';
    const timeout = options?.timeout ?? 1500;
    const redis =
      options?.redisService ??
      (options && options.redisConfigured === false
        ? { isConfigured: false, get: jest.fn(), set: jest.fn() }
        : mockRedisService);

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'IPINFO_TOKEN') return token;
        if (key === 'IPINFO_TIMEOUT_MS') return timeout;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpGeolocationService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpClientService, useValue: mockHttpClient },
        { provide: RedisService, useValue: redis },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<IpGeolocationService>(IpGeolocationService);
    configService = module.get(ConfigService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await createModule();
  });

  describe('getCountryCodeByIp', () => {
    it('should return 2-letter country code for a valid public IP', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          ip: '103.21.244.2',
          country_code: 'IN',
          country_name: 'India',
        },
      });

      // Act
      const result = await service.getCountryCodeByIp('103.21.244.2');

      // Assert
      expect(result).toBe('IN');
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api.ipinfo.io/lite/103.21.244.2?token=test-token',
        expect.objectContaining({
          timeout: 1500,
          headers: { Accept: 'application/json' },
        }),
      );
    });

    it('should normalize uppercase country code', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          ip: '8.8.8.8',
          country_code: 'us',
        },
      });

      // Act
      const result = await service.getCountryCodeByIp('8.8.8.8');

      // Assert
      expect(result).toBe('US');
    });

    it('should return null when ip is undefined or empty', async () => {
      // Act
      const result1 = await service.getCountryCodeByIp(undefined);
      const result2 = await service.getCountryCodeByIp('');

      // Assert
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it.each([
      ['127.0.0.1'],
      ['127.0.0.5'],
      ['::1'],
      ['localhost'],
      ['10.0.0.1'],
      ['10.255.0.1'],
      ['192.168.1.1'],
      ['192.168.0.254'],
      ['172.16.0.1'],
      ['172.25.0.1'],
      ['172.31.255.255'],
      ['169.254.169.254'],
      ['0.0.0.0'],
      ['fe80::1'],
      ['fc00::1'],
      ['::ffff:127.0.0.1'],
      ['::ffff:192.168.1.1'],
    ])(
      'should return null immediately for private/reserved IP: %s without calling axios',
      async (privateIp) => {
        // Act
        const result = await service.getCountryCodeByIp(privateIp);

        // Assert
        expect(result).toBeNull();
        expect(mockHttpClient.get).not.toHaveBeenCalled();
      },
    );

    it('should strip port number from IPv4 and query IPinfo', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValueOnce({
        data: { country_code: 'GB' },
      });

      // Act
      const result = await service.getCountryCodeByIp('81.2.69.142:8080');

      // Assert
      expect(result).toBe('GB');
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api.ipinfo.io/lite/81.2.69.142?token=test-token',
        expect.anything(),
      );
    });

    it('should strip ::ffff: prefix from public IPv4-mapped IPv6 address', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValueOnce({
        data: { country_code: 'US' },
      });

      // Act
      const result = await service.getCountryCodeByIp('::ffff:8.8.8.8');

      // Assert
      expect(result).toBe('US');
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api.ipinfo.io/lite/8.8.8.8?token=test-token',
        expect.anything(),
      );
    });

    it('should return null when IPINFO_TOKEN is not configured', async () => {
      // Arrange
      await createModule({ token: undefined });

      // Act
      const result = await service.getCountryCodeByIp('8.8.8.8');

      // Assert
      expect(result).toBeNull();
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it('should return null gracefully when axios throws a timeout error', async () => {
      // Arrange
      mockHttpClient.get.mockRejectedValueOnce(
        new Error('timeout of 1500ms exceeded'),
      );

      // Act
      const result = await service.getCountryCodeByIp('8.8.8.8');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null gracefully when axios receives HTTP 429 rate limit', async () => {
      // Arrange
      const error: any = new Error('Request failed with status code 429');
      error.isAxiosError = true;
      error.response = { status: 429, data: { error: 'Rate limit exceeded' } };
      mockHttpClient.get.mockRejectedValueOnce(error);

      // Act
      const result = await service.getCountryCodeByIp('8.8.8.8');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when IPinfo response does not contain country_code', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValueOnce({
        data: { ip: '8.8.8.8' },
      });

      // Act
      const result = await service.getCountryCodeByIp('8.8.8.8');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getLocationByIp', () => {
    it('should return null when ip is undefined or empty', async () => {
      // Act
      const result1 = await service.getLocationByIp(undefined);
      const result2 = await service.getLocationByIp('');

      // Assert
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(mockRedisService.get).not.toHaveBeenCalled();
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it.each([
      ['127.0.0.1'],
      ['::1'],
      ['localhost'],
      ['10.0.0.1'],
      ['192.168.1.1'],
      ['172.16.0.1'],
      ['169.254.169.254'],
      ['0.0.0.0'],
      ['fe80::1'],
      ['::ffff:127.0.0.1'],
    ])(
      'should return null immediately for private/reserved IP: %s without cache or HTTP call',
      async (privateIp) => {
        // Act
        const result = await service.getLocationByIp(privateIp);

        // Assert
        expect(result).toBeNull();
        expect(mockRedisService.get).not.toHaveBeenCalled();
        expect(mockHttpClient.get).not.toHaveBeenCalled();
      },
    );

    it('should return cached location from Redis without making HTTP request on cache hit', async () => {
      // Arrange
      const cachedLocation: IpLocation = {
        city: 'Mumbai',
        region: 'Maharashtra',
        countryCode: 'IN',
        countryName: 'India',
        timezone: 'Asia/Kolkata',
        formatted: 'Mumbai, India',
      };
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify(cachedLocation),
      );

      // Act
      const result = await service.getLocationByIp('49.43.243.115');

      // Assert
      expect(result).toEqual(cachedLocation);
      expect(mockRedisService.get).toHaveBeenCalledWith('ip:geo:49.43.243.115');
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it('should fetch from standard IPinfo, format location, and cache in Redis on cache miss', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          ip: '49.43.243.115',
          city: 'Bengaluru',
          region: 'Karnataka',
          country: 'IN',
          loc: '12.9716,77.5946',
          timezone: 'Asia/Kolkata',
        },
      });

      // Act
      const result = await service.getLocationByIp('49.43.243.115');

      // Assert
      expect(result).toEqual({
        city: 'Bengaluru',
        region: 'Karnataka',
        countryCode: 'IN',
        countryName: 'India',
        timezone: 'Asia/Kolkata',
        formatted: 'Bengaluru, India',
      });
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://ipinfo.io/49.43.243.115?token=test-token',
        expect.objectContaining({
          timeout: 1500,
          headers: { Accept: 'application/json' },
        }),
      );
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'ip:geo:49.43.243.115',
        JSON.stringify(result),
        'EX',
        2592000, // 30 days
      );
    });

    it('should resolve US country name and format location correctly', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          ip: '8.8.8.8',
          city: 'Mountain View',
          region: 'California',
          country: 'US',
          timezone: 'America/Los_Angeles',
        },
      });

      // Act
      const result = await service.getLocationByIp('8.8.8.8');

      // Assert
      expect(result).toEqual({
        city: 'Mountain View',
        region: 'California',
        countryCode: 'US',
        countryName: 'United States',
        timezone: 'America/Los_Angeles',
        formatted: 'Mountain View, United States',
      });
    });

    it('should format location with only country if city is missing', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          ip: '1.1.1.1',
          country: 'AU',
        },
      });

      // Act
      const result = await service.getLocationByIp('1.1.1.1');

      // Assert
      expect(result?.city).toBeNull();
      expect(result?.countryCode).toBe('AU');
      expect(result?.countryName).toBe('Australia');
      expect(result?.formatted).toBe('Australia');
    });

    it('should return null when IPINFO_TOKEN is not configured', async () => {
      // Arrange
      await createModule({ token: undefined });
      mockRedisService.get.mockResolvedValueOnce(null);

      // Act
      const result = await service.getLocationByIp('49.43.243.115');

      // Assert
      expect(result).toBeNull();
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it('should gracefully handle Redis read error and fall back to IPinfo query', async () => {
      // Arrange
      mockRedisService.get.mockRejectedValueOnce(
        new Error('Redis connection refused'),
      );
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          city: 'London',
          country: 'GB',
        },
      });

      // Act
      const result = await service.getLocationByIp('81.2.69.142');

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          city: 'London',
          countryCode: 'GB',
          countryName: 'United Kingdom',
          formatted: 'London, United Kingdom',
        }),
      );
    });

    it('should gracefully handle Redis write error and still return resolved location', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValueOnce(null);
      mockRedisService.set.mockRejectedValueOnce(
        new Error('Redis readonly replica'),
      );
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          city: 'Berlin',
          country: 'DE',
        },
      });

      // Act
      const result = await service.getLocationByIp('91.198.174.192');

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          city: 'Berlin',
          countryCode: 'DE',
          countryName: 'Germany',
          formatted: 'Berlin, Germany',
        }),
      );
    });

    it('should return null gracefully when IPinfo HTTP call fails and write negative cache sentinel', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockRejectedValueOnce(new Error('Network timeout'));

      // Act
      const result = await service.getLocationByIp('49.43.243.115');

      // Assert
      expect(result).toBeNull();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'ip:geo:49.43.243.115',
        '__neg__',
        'EX',
        300,
      );
    });

    it('should return null immediately when negative cache sentinel is hit without calling HTTP', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValueOnce('__neg__');

      // Act
      const result = await service.getLocationByIp('49.43.243.115');

      // Assert
      expect(result).toBeNull();
      expect(mockRedisService.get).toHaveBeenCalledWith('ip:geo:49.43.243.115');
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it('should cache negative sentinel when IPinfo returns empty data', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({ data: null });

      // Act
      const result = await service.getLocationByIp('49.43.243.115');

      // Assert
      expect(result).toBeNull();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'ip:geo:49.43.243.115',
        '__neg__',
        'EX',
        300,
      );
    });
  });
});
