import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor() {
    this.initializeMiddleware();
  }

  private initializeMiddleware() {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'];

    if (!requestId) {
      throw new UnauthorizedException('X-Request-ID header is required');
    }

    if (typeof requestId !== 'string') {
      throw new UnauthorizedException('X-Request-ID header must be a string');
    }

    // Store the validated Request Id for use in controllers
    req['requestId'] = requestId;

    next();
  }
}
