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
