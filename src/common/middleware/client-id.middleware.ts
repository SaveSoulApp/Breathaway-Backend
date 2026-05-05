import {
  Inject,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class ClientIdMiddleware implements NestMiddleware {
  private validClientIds: Set<string>;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    this.initializeValidClientIds();
  }

  private initializeValidClientIds() {
    const clientIdsValue = this.configService.get<string>('CLIENT_IDS');

    if (!clientIdsValue) {
      throw new Error('CLIENT_IDS environment variable is required');
    }

    let clientIds: string[];

    try {
      // Try parsing as JSON array
      clientIds = JSON.parse(clientIdsValue);

      if (!Array.isArray(clientIds)) {
        throw new Error('CLIENT_IDS must be a JSON array');
      }
    } catch (error) {
      throw new Error(
        `Failed to parse CLIENT_IDS. Expected a JSON array like ["id1", "id2"]. Got: ${clientIdsValue}`,
      );
    }

    this.validClientIds = new Set(
      clientIds.map((id) => id.trim()).filter((id) => id.length > 0),
    );

    if (this.validClientIds.size === 0) {
      throw new Error('No valid client IDs configured');
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    const clientId = req.headers['x-client-id'];

    if (!clientId) {
      throw new UnauthorizedException('X-Client-ID header is required');
    }

    if (typeof clientId !== 'string') {
      throw new UnauthorizedException('X-Client-ID header must be a string');
    }

    if (!this.validClientIds.has(clientId)) {
      throw new UnauthorizedException('Invalid X-Client-ID');
    }

    // Store the validated client ID for use in controllers if needed
    req['clientId'] = clientId;

    next();
  }
}
