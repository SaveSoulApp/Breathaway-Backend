import {
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * Metadata attached to Axios requests to track outbound execution timing.
 */
export interface HttpRequestMetadata {
  startTime: number;
}

/**
 * Extended AxiosRequestConfig carrying internal tracing and timing metadata.
 */
export interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: HttpRequestMetadata;
}

/**
 * Common abstraction for the HTTP client service.
 */
export interface IHttpClient {
  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>>;
  request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}
