import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual, createHmac } from 'crypto';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException(
        'Missing or Invalid Authorization Header',
      );
    }

    const [username, password] = this.decodeCredentials(authHeader);

    const expectedUsername =
      this.configService.get<string>('DEV_LOGIN_USERNAME');
    const expectedPassword =
      this.configService.get<string>('DEV_LOGIN_PASSWORD');

    if (!expectedUsername || !expectedPassword) {
      // Fail-safe if environment variables are missing
      throw new UnauthorizedException('Authentication configuration missing');
    }

    return (
      this.isAuthorized(username, expectedUsername) &&
      this.isAuthorized(password, expectedPassword)
    );
  }

  /**
   * Decodes the Base64 Basic Auth header.
   */
  private decodeCredentials(header: string): [string, string] {
    const base64Credentials = header.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString(
      'utf-8',
    );
    const parts = credentials.split(':');

    return [parts[0], parts.slice(1).join(':')];
  }

  /**
   * Performs a constant-time comparison.
   * To prevent RangeErrors from different buffer lengths, we compare HMACs
   * of the strings rather than the strings themselves.
   */
  private isAuthorized(input: string, expected: string): boolean {
    const key = 'static-timing-salt'; // Use a consistent salt for the session

    const inputHmac = createHmac('sha256', key).update(input).digest();
    const expectedHmac = createHmac('sha256', key).update(expected).digest();

    // HMACs of the same algorithm always have the same length,
    // making timingSafeEqual safe from RangeErrors.
    return timingSafeEqual(inputHmac, expectedHmac);
  }
}
