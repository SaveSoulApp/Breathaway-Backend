import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const rawId = req.headers['x-request-id'];

    // Fail-safe: Use provided ID or generate a new one. Never throw.
    req['requestId'] =
      typeof rawId === 'string' && rawId.trim() !== '' ? rawId : randomUUID();

    next();
  }
}
