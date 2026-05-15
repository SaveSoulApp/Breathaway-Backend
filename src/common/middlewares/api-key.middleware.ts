import {
  Inject,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  private validApiKeys: Set<string>;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    this.initializeMiddleware();
  }

  private initializeMiddleware() {
    const apiKeysValue = this.configService.get<string>('API_KEYS');

    if (!apiKeysValue) {
      throw new Error('API_KEYS environment variable is required');
    }

    let apiKeys: string[];

    try {
      // Try parsing as JSON array
      apiKeys = JSON.parse(apiKeysValue);

      if (!Array.isArray(apiKeys)) {
        throw new Error('API_KEYS must be a JSON array');
      }
    } catch (error) {
      throw new Error(
        `Failed to parse API_KEYS. Expected a JSON array like ["key1", "key2"]. Got: ${apiKeysValue}`,
      );
    }

    this.validApiKeys = new Set(
      apiKeys.map((key) => key.trim()).filter((key) => key.length > 0),
    );

    if (this.validApiKeys.size === 0) {
      throw new Error('No valid API keys configured');
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('X-API-Key header is required');
    }

    if (typeof apiKey !== 'string') {
      throw new UnauthorizedException('X-API-Key header must be a string');
    }

    if (!this.validApiKeys.has(apiKey)) {
      throw new UnauthorizedException('Invalid X-API-Key');
    }

    // Store the validated API key for use in controllers
    req['apiKey'] = apiKey;

    next();
  }
}
