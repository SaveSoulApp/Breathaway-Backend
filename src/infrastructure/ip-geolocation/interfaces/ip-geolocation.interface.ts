/**
 * Payload returned by the IPinfo Lite country lookup API endpoint.
 *
 * Endpoint: `https://api.ipinfo.io/lite/{ip}?token={token}`
 */
export interface IpinfoLiteResponse {
  ip?: string;
  country_code?: string;
  country_name?: string;
  continent_code?: string;
  continent_name?: string;
}

/**
 * Payload returned by the standard IPinfo geolocation API endpoint.
 *
 * Endpoint: `https://ipinfo.io/{ip}?token={token}`
 */
export interface IpinfoStandardResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
}

/**
 * Normalized geographic location resolved from client IP address.
 */
export interface IpLocation {
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  timezone?: string | null;
  formatted?: string | null;
}
