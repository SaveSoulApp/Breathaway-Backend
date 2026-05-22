import { LoggerService } from '@core/logger';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class PubSubAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

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
      throw new UnauthorizedException('Server configuration error');
    }

    if (!requestToken || requestToken !== expectedToken) {
      this.logger.warn(
        'Unauthorized Pub/Sub ingest attempt. Invalid or missing token.',
      );
      throw new UnauthorizedException('Invalid Pub/Sub verification token');
    }

    return true;
  }
}
