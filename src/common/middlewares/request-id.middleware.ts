import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const rawId = req.headers['x-request-id'];

    if (rawId === undefined || rawId === null) {
      throw new UnauthorizedException('X-Request-ID header is required');
    }

    if (typeof rawId !== 'string') {
      throw new UnauthorizedException('X-Request-ID header must be a string');
    }

    req.requestId = rawId;

    next();
  }
}
