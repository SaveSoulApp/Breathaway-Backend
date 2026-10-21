import { createHmac, timingSafeEqual } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
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

    const rawReceivedSig = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    if (!rawReceivedSig || !rawReceivedSig.trim()) {
      throw new UnauthorizedException(
        'Missing X-Hub-Signature-256 header value',
      );
    }

    const receivedSig = rawReceivedSig.trim();

    if (!receivedSig.toLowerCase().startsWith('sha256=')) {
      this.logger.warn('Meta webhook signature missing sha256= prefix', {
        step: 'invalid_signature_prefix',
        receivedPrefix: receivedSig.slice(0, 10),
      });
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }

    const rawAppSecret =
      this.configService.getOrThrow<string>('META_APP_SECRET');
    const appSecret = rawAppSecret.trim();

    if (!appSecret) {
      this.logger.error('META_APP_SECRET is empty after trimming whitespace', {
        step: 'empty_meta_app_secret',
      });
      throw new InternalServerErrorException(
        'META_APP_SECRET configuration is empty',
      );
    }

    // The raw body Buffer is attached to the request by the global rawBody middleware (configured in main.ts)
    const rawBodyBuffer = (request as Request & { rawBody?: Buffer }).rawBody;
    const rawBody =
      rawBodyBuffer ??
      (typeof request.body === 'string'
        ? Buffer.from(request.body, 'utf8')
        : undefined);

    if (!rawBody) {
      this.logger.error(
        'request.rawBody is missing; raw body buffering is required for Meta webhook signature verification',
        { step: 'raw_body_missing' },
      );
      throw new InternalServerErrorException(
        'Raw body buffering is required for Meta webhook signature verification',
      );
    }

    const computedHash = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    const expectedSignature = `sha256=${computedHash}`;

    const sigBuffer = Buffer.from(receivedSig.toLowerCase(), 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature.toLowerCase(), 'utf8');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      const isLocal =
        this.configService.get<string>('DEPLOYMENT_ENV') === 'local';

      this.logger.warn('Meta webhook signature verification failed', {
        step: 'signature_mismatch',
        appSecretLength: appSecret.length,
        receivedSigLength: sigBuffer.length,
        expectedSigLength: expectedBuffer.length,
        rawBodyLength: rawBody.length,
        ...(isLocal
          ? {
              receivedSig,
              expectedSig: expectedSignature,
              legacySha1Sig: request.headers['x-hub-signature'],
              rawBodyPreview: rawBody.toString('utf8').slice(0, 500),
            }
          : {}),
      });
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }

    return true;
  }
}
