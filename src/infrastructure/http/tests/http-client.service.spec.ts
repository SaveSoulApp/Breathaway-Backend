import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { ExtendedAxiosRequestConfig } from '../http-client.interface';
import { HttpClientService } from '../http-client.service';

describe('HttpClientService', () => {
  let service: HttpClientService;
  let clsService: { isActive: jest.Mock; get: jest.Mock };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
  };

  const loggerServiceMock = {
    forContext: jest.fn().mockReturnValue(mockLogger),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: unknown) => {
      if (key === 'HTTP_CLIENT_TIMEOUT_MS') return 5000;
      return defaultVal;
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    clsService = {
      isActive: jest.fn().mockReturnValue(true),
      get: jest.fn((key: string) => {
        if (key === 'requestId') return 'req-cls-123';
        if (key === 'traceContext') return 'trace-456/span-789;o=1';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpClientService,
        { provide: LoggerService, useValue: loggerServiceMock },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ClsService, useValue: clsService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<HttpClientService>(HttpClientService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with configured timeout and expose axiosRef', () => {
    expect(service.axiosRef).toBeDefined();
    expect(service.axiosRef.defaults.timeout).toBe(5000);
  });

  describe('interceptors', () => {
    it('should inject x-request-id and x-cloud-trace-context from active CLS context', async () => {
      // Find request interceptor
      const requestInterceptor = (
        service.axiosRef.interceptors.request as unknown as {
          handlers: Array<{
            fulfilled: (
              config: ExtendedAxiosRequestConfig,
            ) => ExtendedAxiosRequestConfig;
          }>;
        }
      ).handlers[0]?.fulfilled;

      expect(requestInterceptor).toBeDefined();

      const config: ExtendedAxiosRequestConfig = {
        headers: new AxiosHeaders(),
      };

      const result = requestInterceptor(config);

      expect(result.headers?.['x-request-id']).toBe('req-cls-123');
      expect(result.headers?.['x-cloud-trace-context']).toBe(
        'trace-456/span-789;o=1',
      );
      expect(result.metadata?.startTime).toBeDefined();
    });

    it('should preserve caller-provided headers without overwriting', async () => {
      const requestInterceptor = (
        service.axiosRef.interceptors.request as unknown as {
          handlers: Array<{
            fulfilled: (
              config: ExtendedAxiosRequestConfig,
            ) => ExtendedAxiosRequestConfig;
          }>;
        }
      ).handlers[0]?.fulfilled;

      const config: ExtendedAxiosRequestConfig = {
        headers: new AxiosHeaders({
          'x-request-id': 'custom-req-id',
          'x-cloud-trace-context': 'custom-trace-ctx',
        }),
      };

      const result = requestInterceptor(config);

      expect(result.headers?.['x-request-id']).toBe('custom-req-id');
      expect(result.headers?.['x-cloud-trace-context']).toBe(
        'custom-trace-ctx',
      );
    });

    it('should not throw or inject headers when CLS is inactive', async () => {
      clsService.isActive.mockReturnValue(false);

      const requestInterceptor = (
        service.axiosRef.interceptors.request as unknown as {
          handlers: Array<{
            fulfilled: (
              config: ExtendedAxiosRequestConfig,
            ) => ExtendedAxiosRequestConfig;
          }>;
        }
      ).handlers[0]?.fulfilled;

      const config: ExtendedAxiosRequestConfig = {
        headers: new AxiosHeaders(),
      };

      const result = requestInterceptor(config);

      expect(result.headers?.['x-request-id']).toBeUndefined();
      expect(result.headers?.['x-cloud-trace-context']).toBeUndefined();
      expect(result.metadata?.startTime).toBeDefined();
    });

    it('should log debug milestone on successful response', () => {
      const responseInterceptor = (
        service.axiosRef.interceptors.response as unknown as {
          handlers: Array<{
            fulfilled: (response: unknown) => unknown;
          }>;
        }
      ).handlers[0]?.fulfilled;

      const startTime = Date.now() - 50;
      const fakeResponse = {
        status: 200,
        data: { success: true },
        config: {
          method: 'get',
          url: 'https://api.example.com/data',
          metadata: { startTime },
        } as ExtendedAxiosRequestConfig,
      };

      const result = responseInterceptor(fakeResponse);

      expect(result).toBe(fakeResponse);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Outgoing HTTP request completed',
        expect.objectContaining({
          step: 'http_request_complete',
          method: 'GET',
          url: 'https://api.example.com/data',
          statusCode: 200,
          durationMs: expect.any(Number),
        }),
      );
    });

    it('should log warning milestone and reject on failed response', async () => {
      const errorInterceptor = (
        service.axiosRef.interceptors.response as unknown as {
          handlers: Array<{
            rejected: (error: unknown) => Promise<never>;
          }>;
        }
      ).handlers[0]?.rejected;

      const startTime = Date.now() - 100;
      const fakeError = Object.assign(
        new AxiosError('Request failed with status 503'),
        {
          isAxiosError: true,
          response: { status: 503, data: 'Service Unavailable' },
          config: {
            method: 'post',
            url: 'https://api.example.com/orders',
            metadata: { startTime },
          } as unknown as InternalAxiosRequestConfig,
        },
      );

      await expect(errorInterceptor(fakeError)).rejects.toBe(fakeError);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Outgoing HTTP request failed',
        expect.objectContaining({
          step: 'http_request_failed',
          method: 'POST',
          url: 'https://api.example.com/orders',
          statusCode: 503,
          durationMs: expect.any(Number),
        }),
      );
    });
  });

  describe('HTTP methods delegation', () => {
    it('should delegate get() to axiosRef', async () => {
      jest
        .spyOn(service.axiosRef, 'get')
        .mockResolvedValueOnce({ data: 'ok', status: 200 } as never);

      const res = await service.get('https://example.com/test', {
        params: { a: 1 },
      });

      expect(service.axiosRef.get).toHaveBeenCalledWith(
        'https://example.com/test',
        { params: { a: 1 } },
      );
      expect(res.data).toBe('ok');
    });

    it('should delegate post() to axiosRef', async () => {
      jest
        .spyOn(service.axiosRef, 'post')
        .mockResolvedValueOnce({ data: { id: 1 }, status: 201 } as never);

      const res = await service.post(
        'https://example.com/test',
        { name: 'item' },
        { headers: { 'X-Custom': 'val' } },
      );

      expect(service.axiosRef.post).toHaveBeenCalledWith(
        'https://example.com/test',
        { name: 'item' },
        { headers: { 'X-Custom': 'val' } },
      );
      expect(res.data).toEqual({ id: 1 });
    });

    it('should delegate put(), patch(), delete(), request()', async () => {
      jest
        .spyOn(service.axiosRef, 'put')
        .mockResolvedValueOnce({ data: 'put-ok' } as never);
      jest
        .spyOn(service.axiosRef, 'patch')
        .mockResolvedValueOnce({ data: 'patch-ok' } as never);
      jest
        .spyOn(service.axiosRef, 'delete')
        .mockResolvedValueOnce({ data: 'delete-ok' } as never);
      jest
        .spyOn(service.axiosRef, 'request')
        .mockResolvedValueOnce({ data: 'request-ok' } as never);

      await service.put('https://example.com', { a: 1 });
      await service.patch('https://example.com', { b: 2 });
      await service.delete('https://example.com');
      await service.request({ url: 'https://example.com', method: 'options' });

      expect(service.axiosRef.put).toHaveBeenCalled();
      expect(service.axiosRef.patch).toHaveBeenCalled();
      expect(service.axiosRef.delete).toHaveBeenCalled();
      expect(service.axiosRef.request).toHaveBeenCalled();
    });

    it('should correctly identify Axios errors via isAxiosError', () => {
      const axiosErr = new axios.AxiosError('boom');
      const standardErr = new Error('boom');

      expect(service.isAxiosError(axiosErr)).toBe(true);
      expect(service.isAxiosError(standardErr)).toBe(false);
    });
  });
});
