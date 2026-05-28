import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';

@Injectable()
export class AdminBasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      this.throwUnauthorized(context);
    }

    const base64Credentials = authHeader.slice('Basic '.length);
    const decoded = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex === -1) {
      this.throwUnauthorized(context);
    }

    const providedUser = Buffer.from(decoded.slice(0, separatorIndex));
    const providedPass = Buffer.from(decoded.slice(separatorIndex + 1));

    const expectedUserStr =
      this.configService.getOrThrow<string>('ADMIN_USERNAME');
    const expectedPassStr =
      this.configService.getOrThrow<string>('ADMIN_PASSWORD');

    const expectedUser = Buffer.from(expectedUserStr);
    const expectedPass = Buffer.from(expectedPassStr);

    if (
      this.isValidCredential(providedUser, expectedUser) &&
      this.isValidCredential(providedPass, expectedPass)
    ) {
      return true;
    }

    this.throwUnauthorized(context);
    return false; // Type safety, though throwUnauthorized throws
  }

  private isValidCredential(input: Buffer, expected: Buffer): boolean {
    if (input.length !== expected.length) return false;
    return timingSafeEqual(input, expected);
  }

  private throwUnauthorized(context: ExecutionContext): never {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader(
      'WWW-Authenticate',
      'Basic realm="BreathAway Admin API", charset="UTF-8"',
    );
    throw new UnauthorizedException('Invalid admin credentials');
  }
}
