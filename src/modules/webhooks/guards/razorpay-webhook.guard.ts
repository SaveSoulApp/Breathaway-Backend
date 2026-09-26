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
 * Validates inbound Razorpay webhook requests using HMAC-SHA256 signature verification.
 *
 * Razorpay signs each webhook delivery and attaches the hex-encoded signature in
 * the `X-Razorpay-Signature` header.
 *
 * The signature is computed over the **raw request body bytes** using the
 * webhook secret configured in the Razorpay Dashboard. The guard reads the
 * secret from `ConfigService` (`RAZORPAY_WEBHOOK_SECRET`) — never from
 * `process.env` directly.
 *
 * Comparison uses `timingSafeEqual` to prevent timing-based side-channel attacks.
 *
 * ## How it works
 * ```
 * expectedSig = HMAC-SHA256(RAZORPAY_WEBHOOK_SECRET, rawBodyBytes) → hex
 * timingSafeEqual(expectedSig, X-Razorpay-Signature)
 * ```
 *
 * @see https://razorpay.com/docs/webhooks/validate-test/
 */
@Injectable()
export class RazorpayWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const signatureHeader = request.headers['x-razorpay-signature'];

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing X-Razorpay-Signature header');
    }

    const receivedSig = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    if (!receivedSig) {
      throw new UnauthorizedException(
        'Missing X-Razorpay-Signature header value',
      );
    }

    const secret = this.configService.getOrThrow<string>(
      'RAZORPAY_WEBHOOK_SECRET',
    );

    // The raw body Buffer is attached to the request by the global rawBody middleware
    // (same mechanism used by RevenueCatWebhookGuard — already configured in main.ts).
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    const payloadStr = rawBody
      ? rawBody.toString('utf8')
      : typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);

    const computedSig = createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    const computedBuf = Buffer.from(computedSig, 'utf8');
    const receivedBuf = Buffer.from(receivedSig, 'utf8');

    if (
      computedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(computedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Invalid Razorpay webhook signature');
    }

    return true;
  }
}
