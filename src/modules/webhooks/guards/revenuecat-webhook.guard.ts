import { createHmac, timingSafeEqual } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Validates inbound RevenueCat webhook requests using HMAC-SHA256 signature verification.
 *
 * RevenueCat signs each webhook delivery and attaches the signature in the
 * `X-RevenueCat-Webhook-Signature` header in the format:
 * `t=<unix_timestamp>,v1=<hmac_sha256_hex>`
 *
 * The signature is computed over `<timestamp>.<raw_body_bytes>` using the
 * shared webhook secret configured in RevenueCat dashboard.
 */
@Injectable()
export class RevenueCatWebhookGuard implements CanActivate {
  private readonly toleranceSeconds = 300; // 5 minutes tolerance against clock skew and replay attacks

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signatureHeader = request.headers['x-revenuecat-webhook-signature'];

    if (!signatureHeader) {
      throw new UnauthorizedException(
        'Missing RevenueCat webhook signature header',
      );
    }

    const headerStr = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    if (!headerStr) {
      throw new UnauthorizedException(
        'Missing RevenueCat webhook signature header',
      );
    }

    const parts: Record<string, string> = {};
    for (const item of headerStr.split(',')) {
      const idx = item.indexOf('=');
      if (idx !== -1) {
        parts[item.slice(0, idx).trim()] = item.slice(idx + 1).trim();
      }
    }

    const timestamp = parts['t'];
    const expectedSig = parts['v1'];

    if (!timestamp || !expectedSig) {
      throw new UnauthorizedException(
        'Invalid RevenueCat webhook signature format',
      );
    }

    const timestampSec = parseInt(timestamp, 10);
    if (Number.isNaN(timestampSec)) {
      throw new UnauthorizedException(
        'Invalid RevenueCat webhook timestamp format',
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestampSec) > this.toleranceSeconds) {
      throw new UnauthorizedException(
        'RevenueCat webhook signature timestamp outside tolerance window',
      );
    }

    const secret = this.configService.getOrThrow<string>(
      'REVENUECAT_WEBHOOK_SECRET',
    );

    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    const payloadStr = rawBody
      ? rawBody.toString('utf8')
      : typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);

    const signedPayload = `${timestamp}.${payloadStr}`;
    const computedSig = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    const computedBuf = Buffer.from(computedSig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');

    if (
      computedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(computedBuf, expectedBuf)
    ) {
      throw new UnauthorizedException(
        'Invalid RevenueCat webhook signature hash',
      );
    }

    return true;
  }
}
