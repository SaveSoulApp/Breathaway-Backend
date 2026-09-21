import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { IpGeolocationService } from '../ip-geolocation.service';

jest.mock('axios');

describe('IpGeolocationService', () => {
  let service: IpGeolocationService;
  let configService: jest.Mocked<ConfigService>;
  const mockedAxios = axios as jest.Mocked<typeof axios>;

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
  }) => {
    const token = options && 'token' in options ? options.token : 'test-token';
    const timeout = options?.timeout ?? 1500;

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
      mockedAxios.get.mockResolvedValueOnce({
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
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.ipinfo.io/lite/103.21.244.2?token=test-token',
        expect.objectContaining({
          timeout: 1500,
          headers: { Accept: 'application/json' },
        }),
      );
    });

    it('should normalize uppercase country code', async () => {
      // Arrange
      mockedAxios.get.mockResolvedValueOnce({
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
      expect(mockedAxios.get).not.toHaveBeenCalled();
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
        expect(mockedAxios.get).not.toHaveBeenCalled();
      },
    );

    it('should strip port number from IPv4 and query IPinfo', async () => {
      // Arrange
      mockedAxios.get.mockResolvedValueOnce({
        data: { country_code: 'GB' },
      });

      // Act
      const result = await service.getCountryCodeByIp('81.2.69.142:8080');

      // Assert
      expect(result).toBe('GB');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.ipinfo.io/lite/81.2.69.142?token=test-token',
        expect.anything(),
      );
    });

    it('should strip ::ffff: prefix from public IPv4-mapped IPv6 address', async () => {
      // Arrange
      mockedAxios.get.mockResolvedValueOnce({
        data: { country_code: 'US' },
      });

      // Act
      const result = await service.getCountryCodeByIp('::ffff:8.8.8.8');

      // Assert
      expect(result).toBe('US');
      expect(mockedAxios.get).toHaveBeenCalledWith(
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
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should return null gracefully when axios throws a timeout error', async () => {
      // Arrange
      mockedAxios.get.mockRejectedValueOnce(
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
      mockedAxios.get.mockRejectedValueOnce(error);

      // Act
      const result = await service.getCountryCodeByIp('8.8.8.8');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when IPinfo response does not contain country_code', async () => {
      // Arrange
      mockedAxios.get.mockResolvedValueOnce({
        data: { ip: '8.8.8.8' },
      });

      // Act
      const result = await service.getCountryCodeByIp('8.8.8.8');

      // Assert
      expect(result).toBeNull();
    });
  });
});
