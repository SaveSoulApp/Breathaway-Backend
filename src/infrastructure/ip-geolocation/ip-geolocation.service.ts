import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { HttpClientService } from '@infrastructure/http';
import { RedisService } from '@infrastructure/redis';

import {
  IpinfoLiteResponse,
  IpinfoStandardResponse,
  IpLocation,
} from './interfaces/ip-geolocation.interface';

/**
 * Cache key prefix for IP geolocation entries in Redis.
 */
const IP_GEO_CACHE_PREFIX = 'ip:geo:';

/**
 * 30-day TTL for IP geolocation cache in Redis (in seconds).
 * Physical IP geolocations rarely shift within a 30-day window.
 */
const IP_GEO_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Service providing server-side IP country geolocation using IPinfo Lite
 * and detailed tentative location (city, region, country) using standard IPinfo.
 *
 * Implements distributed Redis caching to minimize external API consumption
 * and achieve sub-millisecond retrieval on active session audits.
 */
@Injectable()
export class IpGeolocationService extends BaseService {
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
    @Optional()
    private readonly redisService?: RedisService,
  ) {
    super(logger);
    this.token = this.configService.get<string>('IPINFO_TOKEN');
    this.timeoutMs = this.configService.get<number>('IPINFO_TIMEOUT_MS', 1500);
  }

  /**
   * Resolves the ISO 3166-1 alpha-2 country code for a given public IP address.
   *
   * Bypasses external network calls for private, loopback, or invalid IP addresses.
   * If IPinfo Lite is unreachable, times out, or returns an error, fails safely by
   * logging a warning and returning `null`.
   *
   * @param ip - Public IPv4 or IPv6 client address.
   * @returns 2-letter uppercase country code (e.g., 'IN', 'US') or `null`.
   */
  async getCountryCodeByIp(ip?: string): Promise<string | null> {
    if (!ip) {
      return null;
    }

    const cleanIp = this.cleanIp(ip);

    if (this.isPrivateOrReservedIp(cleanIp)) {
      return null;
    }

    if (!this.token) {
      this.logger.warn(
        'IPINFO_TOKEN is not configured; skipping IP geolocation',
        {
          step: 'check_token',
        },
      );
      return null;
    }

    const startTime = Date.now();
    try {
      const url = `https://api.ipinfo.io/lite/${cleanIp}?token=${this.token}`;
      const response = await this.httpClient.get<IpinfoLiteResponse>(url, {
        timeout: this.timeoutMs,
        headers: { Accept: 'application/json' },
      });

      const countryCode = response.data?.country_code?.trim().toUpperCase();

      if (countryCode && countryCode.length === 2) {
        return countryCode;
      }

      this.logger.warn(
        'IPinfo Lite returned response without valid country code',
        {
          step: 'parse_country',
          durationMs: Date.now() - startTime,
        },
      );
      return null;
    } catch (error) {
      this.logger.warn('IPinfo Lite geolocation request failed', {
        step: 'fetch_country',
        durationMs: Date.now() - startTime,
        err: serializeError(error),
      });
      return null;
    }
  }

  /**
   * Resolves tentative geographic location (city, region, country, and formatted string)
   * for a given public IP address using IPinfo, with Redis caching (30-day TTL).
   *
   * Bypasses external calls for private, loopback, or invalid IP addresses.
   * Fails safely by returning `null` if IPinfo is unreachable or unconfigured.
   *
   * @param ip - Public IPv4 or IPv6 client address.
   * @returns Resolved IpLocation or `null`.
   */
  async getLocationByIp(ip?: string): Promise<IpLocation | null> {
    if (!ip) {
      return null;
    }

    const cleanIp = this.cleanIp(ip);

    if (this.isPrivateOrReservedIp(cleanIp)) {
      return null;
    }

    // 1. Check Redis cache first (sub-millisecond return)
    if (this.redisService?.isConfigured) {
      try {
        const cached = await this.redisService.get(
          `${IP_GEO_CACHE_PREFIX}${cleanIp}`,
        );
        if (cached) {
          return JSON.parse(cached) as IpLocation;
        }
      } catch (err) {
        this.logger.warn('Failed to read IP geolocation from Redis cache', {
          step: 'read_ip_geo_cache_failed',
          cleanIp,
          error: serializeError(err),
        });
      }
    }

    if (!this.token) {
      this.logger.warn(
        'IPINFO_TOKEN is not configured; skipping IP geolocation',
        {
          step: 'check_token',
        },
      );
      return null;
    }

    // 2. Query standard IPinfo API
    const startTime = Date.now();
    try {
      const url = `https://ipinfo.io/${cleanIp}?token=${this.token}`;
      const response = await this.httpClient.get<IpinfoStandardResponse>(url, {
        timeout: this.timeoutMs,
        headers: { Accept: 'application/json' },
      });

      const data = response.data;
      if (!data) {
        return null;
      }

      const countryCode = data.country?.trim().toUpperCase() || null;
      const countryName = countryCode
        ? this.resolveCountryName(countryCode)
        : null;
      const city = data.city?.trim() || null;
      const region = data.region?.trim() || null;
      const timezone = data.timezone?.trim() || null;
      const formatted = this.formatLocation(city, countryName);

      const location: IpLocation = {
        city,
        region,
        countryCode,
        countryName,
        timezone,
        formatted,
      };

      // 3. Cache in Redis
      if (this.redisService?.isConfigured) {
        try {
          await this.redisService.set(
            `${IP_GEO_CACHE_PREFIX}${cleanIp}`,
            JSON.stringify(location),
            'EX',
            IP_GEO_CACHE_TTL_SECONDS,
          );
        } catch (err) {
          this.logger.warn('Failed to cache IP geolocation in Redis', {
            step: 'write_ip_geo_cache_failed',
            cleanIp,
            error: serializeError(err),
          });
        }
      }

      return location;
    } catch (error) {
      this.logger.warn('IPinfo geolocation request failed', {
        step: 'fetch_location',
        durationMs: Date.now() - startTime,
        cleanIp,
        err: serializeError(error),
      });
      return null;
    }
  }

  /**
   * Resolves the human-readable English country name for an ISO 3166-1 alpha-2 country code.
   */
  private resolveCountryName(countryCode: string): string | null {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      return displayNames.of(countryCode) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Formats city and country into a clean, human-readable display string.
   */
  private formatLocation(
    city: string | null,
    countryName: string | null,
  ): string | null {
    if (city && countryName) {
      return `${city}, ${countryName}`;
    }
    return city ?? countryName ?? null;
  }

  /**
   * Normalizes an IP string by stripping IPv4-mapped IPv6 prefixes and port numbers.
   */
  private cleanIp(rawIp: string): string {
    let ip = rawIp.trim();

    // Strip IPv4-mapped IPv6 prefix (e.g. "::ffff:192.168.1.1" -> "192.168.1.1")
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }

    // Strip port if formatted as ip:port (IPv4 only)
    if (ip.includes(':') && ip.indexOf(':') === ip.lastIndexOf(':')) {
      ip = ip.split(':')[0];
    }

    return ip;
  }

  /**
   * Checks whether the given IP is a loopback, link-local, private, or reserved address.
   */
  private isPrivateOrReservedIp(ip: string): boolean {
    // Loopback IPv4 & IPv6
    if (ip === 'localhost' || ip === '::1' || ip.startsWith('127.')) {
      return true;
    }

    // IPv6 link-local and unique local addresses
    if (
      ip.startsWith('fe80:') ||
      ip.startsWith('fc00:') ||
      ip.startsWith('fd00:')
    ) {
      return true;
    }

    // IPv4 private ranges (RFC 1918) and link-local (RFC 3927)
    // 10.0.0.0/8
    if (ip.startsWith('10.')) {
      return true;
    }

    // 192.168.0.0/16
    if (ip.startsWith('192.168.')) {
      return true;
    }

    // 169.254.0.0/16 (Link-local, including GCP metadata/router addresses)
    if (ip.startsWith('169.254.')) {
      return true;
    }

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (ip.startsWith('172.')) {
      const parts = ip.split('.');
      if (parts.length >= 2) {
        const secondOctet = Number(parts[1]);
        if (secondOctet >= 16 && secondOctet <= 31) {
          return true;
        }
      }
    }

    // Unspecified address
    if (ip === '0.0.0.0' || ip === '::') {
      return true;
    }

    return false;
  }
}
