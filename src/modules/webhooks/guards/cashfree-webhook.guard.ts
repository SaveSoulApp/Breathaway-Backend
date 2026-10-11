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
 * Validates inbound Cashfree webhook requests using HMAC-SHA256 signature verification.
 *
 * Cashfree signs each webhook delivery and attaches:
 * - `x-webhook-signature`: Base64-encoded HMAC-SHA256 signature
 * - `x-webhook-timestamp`: Timestamp of the webhook event
 *
 * The signature is computed as:
 *   HMAC-SHA256(CASHFREE_SECRET_KEY, timestamp + rawBody) -> base64
 *
 * Comparison uses `timingSafeEqual` to prevent timing-based side-channel attacks.
 * An optional 5-minute (300 seconds) timestamp tolerance window guards against replay attacks.
 *
 * @see https://docs.cashfree.com/docs/payments/online/webhooks/overview
 */
@Injectable()
export class CashfreeWebhookGuard implements CanActivate {
  private readonly toleranceSeconds = 300; // 5 minutes

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const signatureHeader = request.headers['x-webhook-signature'];
    const timestampHeader = request.headers['x-webhook-timestamp'];

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing x-webhook-signature header');
    }

    if (!timestampHeader) {
      throw new UnauthorizedException('Missing x-webhook-timestamp header');
    }

    const receivedSig = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    const timestamp = Array.isArray(timestampHeader)
      ? timestampHeader[0]
      : timestampHeader;

    if (!receivedSig) {
      throw new UnauthorizedException(
        'Missing x-webhook-signature header value',
      );
    }

    if (!timestamp) {
      throw new UnauthorizedException(
        'Missing x-webhook-timestamp header value',
      );
    }

    // Replay attack protection: verify timestamp within 5 minutes tolerance window
    const tsNum = parseInt(timestamp, 10);
    if (!Number.isNaN(tsNum)) {
      const tsSec = tsNum > 1e11 ? Math.floor(tsNum / 1000) : tsNum;
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - tsSec) > this.toleranceSeconds) {
        throw new UnauthorizedException(
          'Cashfree webhook signature timestamp outside tolerance window',
        );
      }
    }

    const secret = this.configService.getOrThrow<string>('CASHFREE_SECRET_KEY');

    // The raw body Buffer is attached to the request by the global rawBody middleware
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    const payloadStr = rawBody
      ? rawBody.toString('utf8')
      : typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body ?? {});

    const signedPayload = `${timestamp}${payloadStr}`;
    const computedSig = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('base64');

    const computedBuf = Buffer.from(computedSig, 'utf8');
    const receivedBuf = Buffer.from(receivedSig, 'utf8');

    if (
      computedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(computedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Invalid Cashfree webhook signature');
    }

    return true;
  }
}
