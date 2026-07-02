import { LoggerService } from '@core/logger';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { MissingPubSubConfigException, InvalidPubSubTokenException } from '../application/exceptions';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Protects the Pub/Sub ingestion endpoint by validating a shared-secret token
 * passed as a `?token=` query parameter on every push request.
 *
 * GCP Pub/Sub push subscriptions are configured with a push endpoint URL that
 * includes this token. Any request without the correct token is immediately
 * rejected, preventing unauthenticated callers from triggering event handlers.
 */
@Injectable()
export class PubSubAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Grants access when the `?token` query parameter matches `PUBSUB_VERIFICATION_TOKEN`.
   *
   * A missing or misconfigured `PUBSUB_VERIFICATION_TOKEN` environment variable
   * is treated as a server configuration error rather than a silent bypass.
   *
   * @returns `true` when the token is valid.
   * @throws {MissingPubSubConfigException} When `PUBSUB_VERIFICATION_TOKEN` is not set
   *   in the environment.
   * @throws {InvalidPubSubTokenException} When the request token is absent or does not
   *   match the expected value.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // GCP Pub/Sub push requests can include a secret token in the query string
    // e.g., POST /pubsub/ingest?token=YOUR_SECRET_TOKEN
    const requestToken = request.query.token as string;

    const expectedToken = this.configService.get<string>(
      'PUBSUB_VERIFICATION_TOKEN',
    );

    if (!expectedToken) {
      this.logger.error(
        'PUBSUB_VERIFICATION_TOKEN is not configured in the environment.',
      );
      throw new MissingPubSubConfigException();
    }

    if (!requestToken || requestToken !== expectedToken) {
      this.logger.warn(
        'Unauthorized Pub/Sub ingest attempt. Invalid or missing token.',
      );
      throw new InvalidPubSubTokenException();
    }

    return true;
  }
}
