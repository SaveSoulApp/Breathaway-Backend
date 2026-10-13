import { createHmac, timingSafeEqual } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { BaseGuard } from '@core/base';
import { LoggerService } from '@core/logger';

/**
 * Validates inbound Meta (Instagram / WhatsApp) webhook requests using HMAC-SHA256 signature verification.
 *
 * Meta signs each webhook event notification using the App Secret and attaches the signature
 * in the `X-Hub-Signature-256` HTTP header in the format:
 * `sha256=<hex_encoded_hmac>`
 *
 * The signature is computed over the raw request payload bytes using the Meta App Secret
 * configured in the Meta Developer App Dashboard (`META_APP_SECRET`).
 *
 * Comparison uses `timingSafeEqual` to prevent timing-based side-channel attacks.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
@Injectable()
export class MetaWebhookGuard extends BaseGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    super(loggerService);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const signatureHeader = request.headers['x-hub-signature-256'];

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    const receivedSig = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    if (!receivedSig || !receivedSig.trim()) {
      throw new UnauthorizedException(
        'Missing X-Hub-Signature-256 header value',
      );
    }

    if (!receivedSig.toLowerCase().startsWith('sha256=')) {
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }

    const appSecret = this.configService.getOrThrow<string>('META_APP_SECRET');

    // The raw body Buffer is attached to the request by the global rawBody middleware
    const rawBodyBuffer = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBodyBuffer && typeof request.body !== 'string') {
      this.logger.warn(
        'request.rawBody is missing; falling back to JSON.stringify(request.body) which may cause HMAC mismatch if JSON serialization varies',
        { step: 'raw_body_missing_fallback' },
      );
    }

    const rawBody =
      rawBodyBuffer ??
      Buffer.from(
        typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body ?? {}),
        'utf8',
      );

    const computedHash = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    const expectedSignature = `sha256=${computedHash}`;

    const sigBuffer = Buffer.from(receivedSig.trim().toLowerCase(), 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature.toLowerCase(), 'utf8');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }

    return true;
  }
}
