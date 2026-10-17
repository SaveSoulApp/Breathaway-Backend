import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  ExtendedAxiosRequestConfig,
  IHttpClient,
} from './http-client.interface';

/**
 * Resilient, centralized HTTP client wrapping Axios.
 *
 * Provides:
 * 1. Automatic context propagation (`x-request-id`, `x-cloud-trace-context`) from CLS
 *    for end-to-end distributed tracing across external services and APIs.
 * 2. Bounded default execution timeouts to prevent unhandled hung sockets on Cloud Run.
 * 3. Structured milestone logging with duration tracking on outbound requests.
 * 4. PII-safe error serialization on failed external calls.
 * 5. First-class NestJS Dependency Injection to eliminate brittle `jest.mock('axios')` patterns.
 */
@Injectable()
export class HttpClientService extends BaseService implements IHttpClient {
  private readonly client: AxiosInstance;
  private readonly defaultTimeoutMs: number;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(loggerService);

    this.defaultTimeoutMs = Number(
      this.configService.get<number>('HTTP_CLIENT_TIMEOUT_MS', 10000),
    );

    this.client = axios.create({
      timeout: this.defaultTimeoutMs,
    });

    this.setupInterceptors();
  }

  /**
   * Returns the underlying Axios instance for advanced use cases (e.g. streaming or custom transforms).
   */
  get axiosRef(): AxiosInstance {
    return this.client;
  }

  /**
   * Type guard to check if an unknown error is an AxiosError.
   */
  isAxiosError<T = unknown, D = unknown>(
    error: unknown,
  ): error is AxiosError<T, D> {
    return axios.isAxiosError(error);
  }

  /**
   * Configures outbound request and response interceptors for tracing, timing, and error logging.
   */
  private setupInterceptors(): void {
    // 1. Outgoing Request Interceptor: Inject Tracing & Start Time
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const extendedConfig = config as ExtendedAxiosRequestConfig;
        extendedConfig.metadata = { startTime: Date.now() };

        if (this.cls?.isActive()) {
          const requestId = this.cls.get<string>('requestId');
          const traceContext = this.cls.get<string>('traceContext');

          if (requestId) {
            if (typeof config.headers?.set === 'function') {
              if (!config.headers.has('x-request-id')) {
                config.headers.set('x-request-id', requestId);
              }
            } else if (config.headers && !config.headers['x-request-id']) {
              config.headers['x-request-id'] = requestId;
            }
          }

          if (traceContext) {
            if (typeof config.headers?.set === 'function') {
              if (!config.headers.has('x-cloud-trace-context')) {
                config.headers.set('x-cloud-trace-context', traceContext);
              }
            } else if (
              config.headers &&
              !config.headers['x-cloud-trace-context']
            ) {
              config.headers['x-cloud-trace-context'] = traceContext;
            }
          }
        }

        return config;
      },
    );

    // 2. Incoming Response Interceptor: Duration Tracking & Debug Logging
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const config = response.config as ExtendedAxiosRequestConfig;
        const durationMs = config.metadata?.startTime
          ? Date.now() - config.metadata.startTime
          : undefined;

        this.logger.debug('Outgoing HTTP request completed', {
          step: 'http_request_complete',
          method: config.method?.toUpperCase(),
          url: config.url,
          statusCode: response.status,
          ...(durationMs !== undefined && { durationMs }),
        });

        return response;
      },
      (error: unknown) => {
        const config = (
          axios.isAxiosError(error) ? error.config : undefined
        ) as ExtendedAxiosRequestConfig | undefined;

        const durationMs = config?.metadata?.startTime
          ? Date.now() - config.metadata.startTime
          : undefined;

        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;

        this.logger.warn('Outgoing HTTP request failed', {
          step: 'http_request_failed',
          method: config?.method?.toUpperCase(),
          url: config?.url,
          statusCode: status,
          ...(durationMs !== undefined && { durationMs }),
          err: serializeError(error),
        });

        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      },
    );
  }

  async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  async request<T = unknown>(
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.request<T>(config);
  }
}
