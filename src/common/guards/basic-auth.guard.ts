import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization Header');
    }

    if (!authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException('Invalid Authorization Header');
    }

    const [username, password] = this.decodeCredentials(authHeader);

    const expectedUsername =
      this.configService.get<string>('DEV_LOGIN_USERNAME');
    const expectedPassword =
      this.configService.get<string>('DEV_LOGIN_PASSWORD');

    if (!expectedUsername || !expectedPassword) {
      throw new UnauthorizedException('Invalid Credentials');
    }

    const isValid =
      this.isAuthorized(username, expectedUsername) &&
      this.isAuthorized(password, expectedPassword);

    if (!isValid) {
      throw new UnauthorizedException('Invalid Credentials');
    }

    return true;
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
    const key = 'static-timing-salt';

    const inputHmac = createHmac('sha256', key).update(input).digest();
    const expectedHmac = createHmac('sha256', key).update(expected).digest();

    return timingSafeEqual(inputHmac, expectedHmac);
  }
}
